import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';
import dotenv from 'dotenv';
import ical from 'node-ical';
import type {
  CalendarEventItem,
  CalendarSyncPayload,
  CompetitorInfo,
  GameState,
  HomeViewSettings,
  SportLeague,
  SportsPayload,
  TeamGameSnapshot,
  TeamSportsData,
  WeatherData,
} from './src/types/homeview.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// ---------------------------------------------------------------------------
// Weather helpers (Open-Meteo, zero API key required)
// ---------------------------------------------------------------------------

function describeWmoCode(code: number, isDay: boolean): string {
  if (code === 0) return isDay ? 'Clear' : 'Clear Night';
  if (code === 1) return 'Mostly Clear';
  if (code === 2) return 'Partly Cloudy';
  if (code === 3) return 'Cloudy';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 65) return 'Rain';
  if (code === 66 || code === 67) return 'Freezing Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Showers';
  if (code === 85 || code === 86) return 'Snow Showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Cloudy';
}

async function fetchWeather(
  lat: number,
  lon: number,
  city: string,
  unit: 'F' | 'C',
): Promise<WeatherData> {
  const tempUnitParam = unit === 'C' ? 'celsius' : 'fahrenheit';
  const windUnitParam = unit === 'C' ? 'kmh' : 'mph';
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m` +
    `&hourly=temperature_2m,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min` +
    `&temperature_unit=${tempUnitParam}` +
    `&wind_speed_unit=${windUnitParam}` +
    `&timezone=auto` +
    `&forecast_days=2`;

  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    throw new Error(`Weather API responded ${response.status}`);
  }
  const raw = (await response.json()) as {
    current: {
      temperature_2m: number;
      relative_humidity_2m: number;
      apparent_temperature: number;
      is_day: number;
      weather_code: number;
      wind_speed_10m: number;
      time: string;
    };
    daily: {
      temperature_2m_max: number[];
      temperature_2m_min: number[];
    };
    hourly: {
      time: string[];
      temperature_2m: number[];
      weather_code: number[];
    };
  };

  const isDay = raw.current.is_day === 1;
  const currentTimeMs = new Date(raw.current.time).getTime();

  const hourly: { time: string; temp: number; weatherCode: number }[] = [];
  if (raw.hourly?.time?.length) {
    for (let i = 0; i < raw.hourly.time.length; i++) {
      const slotMs = new Date(raw.hourly.time[i]).getTime();
      if (slotMs > currentTimeMs && hourly.length < 4) {
        if ((slotMs - currentTimeMs) >= 2.5 * 3600 * 1000 * (hourly.length)) {
          hourly.push({
            time: raw.hourly.time[i],
            temp: Math.round(raw.hourly.temperature_2m[i]),
            weatherCode: raw.hourly.weather_code[i],
          });
        }
      }
    }
  }

  return {
    city,
    temp: Math.round(raw.current.temperature_2m),
    feelsLike: Math.round(raw.current.apparent_temperature),
    high: Math.round(raw.daily.temperature_2m_max[0] ?? raw.current.temperature_2m),
    low: Math.round(raw.daily.temperature_2m_min[0] ?? raw.current.temperature_2m),
    weatherCode: raw.current.weather_code,
    condition: describeWmoCode(raw.current.weather_code, isDay),
    windSpeed: Math.round(raw.current.wind_speed_10m),
    humidity: Math.round(raw.current.relative_humidity_2m),
    isDay,
    unit,
    hourly,
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Live Sports helpers (ESPN public JSON endpoints with 15s cache)
// ---------------------------------------------------------------------------

interface TeamConfig {
  teamKey: 'lions' | 'devils' | 'unc' | 'notredame';
  league: SportLeague;
  leagueLabel: string;
  sportPath: string;
  teamId: string;
  fallbackName: string;
  fallbackShort: string;
  fallbackAbbr: string;
  fallbackColor: string;
}

const TEAM_CONFIGS: TeamConfig[] = [
  {
    teamKey: 'lions',
    league: 'nfl',
    leagueLabel: 'NFL',
    sportPath: 'football/nfl',
    teamId: '8',
    fallbackName: 'Detroit Lions',
    fallbackShort: 'Lions',
    fallbackAbbr: 'DET',
    fallbackColor: '#0076B6',
  },
  {
    teamKey: 'devils',
    league: 'nhl',
    leagueLabel: 'NHL',
    sportPath: 'hockey/nhl',
    teamId: '11',
    fallbackName: 'New Jersey Devils',
    fallbackShort: 'Devils',
    fallbackAbbr: 'NJ',
    fallbackColor: '#CE1126',
  },
  {
    teamKey: 'unc',
    league: 'ncaam',
    leagueLabel: 'NCAAM',
    sportPath: 'basketball/mens-college-basketball',
    teamId: '153',
    fallbackName: 'North Carolina Tar Heels',
    fallbackShort: 'UNC',
    fallbackAbbr: 'UNC',
    fallbackColor: '#4B9CD3',
  },
  {
    teamKey: 'notredame',
    league: 'ncaaf',
    leagueLabel: 'NCAAF',
    sportPath: 'football/college-football',
    teamId: '87',
    fallbackName: 'Notre Dame Fighting Irish',
    fallbackShort: 'Notre Dame',
    fallbackAbbr: 'ND',
    fallbackColor: '#0C2340',
  },
];

interface EspnCompetitor {
  id?: string;
  homeAway?: 'home' | 'away';
  winner?: boolean;
  score?: string | { value?: number; displayValue?: string };
  curatedRank?: { current?: number };
  records?: Array<{ summary?: string; type?: string }>;
  record?: Array<{ displayValue?: string; summary?: string }>;
  team?: {
    id?: string;
    abbreviation?: string;
    displayName?: string;
    shortDisplayName?: string;
    name?: string;
    logo?: string;
    logos?: Array<{ href?: string }>;
  };
}

interface EspnCompetition {
  date?: string;
  venue?: { fullName?: string; address?: { city?: string } };
  broadcasts?: Array<{ names?: string[] }>;
  geoBroadcasts?: Array<{ media?: { shortName?: string } }>;
  situation?: {
    shortDownDistanceText?: string;
    downDistanceText?: string;
    possessionText?: string;
    lastPlay?: { text?: string };
  };
  competitors?: EspnCompetitor[];
  status?: {
    clock?: number;
    displayClock?: string;
    period?: number;
    type?: {
      state?: string;
      completed?: boolean;
      shortDetail?: string;
      detail?: string;
      description?: string;
    };
  };
}

interface EspnEvent {
  id?: string;
  date?: string;
  name?: string;
  shortName?: string;
  competitions?: EspnCompetition[];
}

function extractScore(score: EspnCompetitor['score']): string {
  if (score === undefined || score === null) return '0';
  if (typeof score === 'string') return score;
  if (typeof score === 'object') {
    if (score.displayValue) return score.displayValue;
    if (typeof score.value === 'number') return String(score.value);
  }
  return '0';
}

function mapCompetitor(c: EspnCompetitor): CompetitorInfo {
  const logo =
    c.team?.logo ||
    c.team?.logos?.[0]?.href ||
    '';
  const recordStr =
    c.records?.[0]?.summary ||
    c.record?.[0]?.displayValue ||
    c.record?.[0]?.summary ||
    undefined;
  const rankVal = c.curatedRank?.current;
  return {
    id: c.team?.id || c.id || '',
    abbreviation: c.team?.abbreviation || '',
    name: c.team?.displayName || c.team?.name || '',
    shortName: c.team?.shortDisplayName || c.team?.name || c.team?.abbreviation || '',
    logo,
    score: extractScore(c.score),
    homeAway: c.homeAway === 'away' ? 'away' : 'home',
    winner: c.winner,
    rank: rankVal && rankVal <= 25 ? rankVal : undefined,
    record: recordStr,
  };
}

function extractBroadcast(comp?: EspnCompetition): string | undefined {
  const b1 = comp?.broadcasts?.[0]?.names?.[0];
  if (b1) return b1;
  const b2 = comp?.geoBroadcasts?.[0]?.media?.shortName;
  if (b2) return b2;
  return undefined;
}

async function fetchJsonSafe<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'HomeViewHub/1.0' },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchTeamSportsData(cfg: TeamConfig): Promise<TeamSportsData> {
  const base = `https://site.api.espn.com/apis/site/v2/sports/${cfg.sportPath}`;
  const [teamRes, scoreboardRes, scheduleRes] = await Promise.all([
    fetchJsonSafe<{
      team?: {
        displayName?: string;
        shortDisplayName?: string;
        abbreviation?: string;
        color?: string;
        logos?: Array<{ href?: string }>;
        record?: { items?: Array<{ summary?: string; type?: string }> };
        standingSummary?: string;
        rank?: number;
        nextEvent?: EspnEvent[];
      };
    }>(`${base}/teams/${cfg.teamId}`),
    fetchJsonSafe<{ events?: EspnEvent[] }>(`${base}/scoreboard`),
    fetchJsonSafe<{ events?: EspnEvent[] }>(`${base}/teams/${cfg.teamId}/schedule`),
  ]);

  const teamObj = teamRes?.team;
  const teamName = teamObj?.displayName || cfg.fallbackName;
  const teamShortName = teamObj?.shortDisplayName || cfg.fallbackShort;
  const teamAbbr = teamObj?.abbreviation || cfg.fallbackAbbr;
  const teamLogo = teamObj?.logos?.[0]?.href || '';
  const teamColor = teamObj?.color ? `#${teamObj.color}` : cfg.fallbackColor;
  const record =
    teamObj?.record?.items?.find((i) => i.type === 'total')?.summary ||
    teamObj?.record?.items?.[0]?.summary ||
    '';
  const standingSummary = teamObj?.standingSummary || undefined;
  const teamRank = teamObj?.rank && teamObj.rank <= 25 ? teamObj.rank : undefined;

  // 1. Check live / today's scoreboard first for real-time score & clock
  const scoreboardEvent = scoreboardRes?.events?.find((ev) =>
    ev.competitions?.[0]?.competitors?.some(
      (c) => c.team?.id === cfg.teamId || c.id === cfg.teamId,
    ),
  );

  // 2. Gather schedule events to find next upcoming and most recent completed game
  const scheduleEvents = scheduleRes?.events || [];
  const nowMs = Date.now();

  const completedEvents = scheduleEvents
    .filter((ev) => ev.competitions?.[0]?.status?.type?.completed)
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

  const upcomingEvents = scheduleEvents
    .filter(
      (ev) =>
        !ev.competitions?.[0]?.status?.type?.completed &&
        new Date(ev.date || 0).getTime() >= nowMs - 4 * 3600 * 1000,
    )
    .sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());

  const lastCompleted = completedEvents[0];
  let lastGameSummary: string | undefined;
  if (lastCompleted?.competitions?.[0]?.competitors) {
    const comps = lastCompleted.competitions[0].competitors;
    const us = comps.find((c) => c.team?.id === cfg.teamId || c.id === cfg.teamId);
    const them = comps.find((c) => c.team?.id !== cfg.teamId && c.id !== cfg.teamId);
    if (us && them) {
      const usScore = extractScore(us.score);
      const themScore = extractScore(them.score);
      const wl = us.winner ? 'W' : 'L';
      const prefix = us.homeAway === 'away' ? '@' : 'vs';
      lastGameSummary = `Last: ${wl} ${usScore}-${themScore} ${prefix} ${them.team?.abbreviation || them.team?.shortDisplayName || 'OPP'}`;
    }
  }

  const mapEspnEventToSnapshot = (ev: EspnEvent): TeamGameSnapshot | null => {
    const comp = ev.competitions?.[0];
    if (!comp) return null;
    const rawState = comp.status?.type?.state;
    const state: GameState =
      rawState === 'in'
        ? 'in'
        : rawState === 'post' || comp.status?.type?.completed
          ? 'post'
          : 'pre';

    const competitors = (comp.competitors || []).map(mapCompetitor);
    const homeTeam = competitors.find((c) => c.homeAway === 'home') || competitors[0];
    const awayTeam = competitors.find((c) => c.homeAway === 'away') || competitors[1];

    const statusText =
      state === 'in'
        ? comp.status?.type?.shortDetail || 'Live'
        : state === 'post'
          ? comp.status?.type?.shortDetail || 'Final'
          : comp.status?.type?.shortDetail || 'Upcoming';

    const statusDetail = comp.status?.type?.detail || statusText;
    const situation =
      state === 'in'
        ? comp.situation?.shortDownDistanceText ||
          comp.situation?.possessionText ||
          comp.situation?.lastPlay?.text
        : undefined;

    return {
      eventId: ev.id || `${ev.date || ''}`,
      state,
      statusText,
      statusDetail,
      gameDate: ev.date || comp.date,
      broadcast: extractBroadcast(comp),
      venue: comp.venue?.fullName,
      situation,
      homeTeam,
      awayTeam,
    };
  };

  // Collect candidate games around today so client matches exact local calendar date
  const candidateMap = new Map<string, TeamGameSnapshot>();
  const windowMin = nowMs - 30 * 3600 * 1000;
  const windowMax = nowMs + 48 * 3600 * 1000;

  const rawCandidates: EspnEvent[] = [
    ...(scoreboardEvent ? [scoreboardEvent] : []),
    ...scheduleEvents.filter((ev) => {
      const t = new Date(ev.date || 0).getTime();
      const st = ev.competitions?.[0]?.status?.type?.state;
      return st === 'in' || (t >= windowMin && t <= windowMax);
    }),
  ];

  for (const ev of rawCandidates) {
    const snap = mapEspnEventToSnapshot(ev);
    if (snap && !candidateMap.has(snap.eventId)) {
      candidateMap.set(snap.eventId, snap);
    }
  }
  const candidateGames = Array.from(candidateMap.values());

  // Decide active spotlight event: scoreboard live/today > nextEvent > upcoming > lastCompleted
  const nextFromTeam = teamObj?.nextEvent?.[0];
  const chosenEvent =
    scoreboardEvent ||
    (nextFromTeam?.competitions?.[0]?.status?.type?.state === 'in' ? nextFromTeam : null) ||
    upcomingEvents[0] ||
    nextFromTeam ||
    lastCompleted;

  if (!chosenEvent || !chosenEvent.competitions?.[0]) {
    return {
      teamKey: cfg.teamKey,
      league: cfg.league,
      leagueLabel: cfg.leagueLabel,
      teamName,
      teamShortName,
      teamAbbr,
      teamLogo,
      teamColor,
      record,
      rank: teamRank,
      standingSummary,
      state: 'offseason',
      statusText: 'Offseason',
      statusDetail: 'No scheduled games right now',
      lastGameSummary,
      candidateGames,
      updatedAt: new Date().toISOString(),
    };
  }

  const chosenSnap = mapEspnEventToSnapshot(chosenEvent)!;
  const ourCompetitor = [chosenSnap.homeTeam, chosenSnap.awayTeam].find(
    (c) => c?.id === cfg.teamId,
  );
  const effectiveRank = teamRank || ourCompetitor?.rank;

  return {
    teamKey: cfg.teamKey,
    league: cfg.league,
    leagueLabel: cfg.leagueLabel,
    teamName,
    teamShortName,
    teamAbbr,
    teamLogo,
    teamColor,
    record,
    rank: effectiveRank,
    standingSummary,
    state: chosenSnap.state,
    statusText: chosenSnap.statusText,
    statusDetail: chosenSnap.statusDetail,
    gameDate: chosenSnap.gameDate,
    broadcast: chosenSnap.broadcast,
    venue: chosenSnap.venue,
    situation: chosenSnap.situation,
    homeTeam: chosenSnap.homeTeam,
    awayTeam: chosenSnap.awayTeam,
    lastGameSummary,
    candidateGames,
    updatedAt: new Date().toISOString(),
  };
}

let sportsCache: { data: SportsPayload; fetchedAt: number } | null = null;
const SPORTS_CACHE_MS = 15_000;

async function getSportsPayload(force = false): Promise<SportsPayload> {
  if (!force && sportsCache && Date.now() - sportsCache.fetchedAt < SPORTS_CACHE_MS) {
    return sportsCache.data;
  }
  const teams = await Promise.all(TEAM_CONFIGS.map((cfg) => fetchTeamSportsData(cfg)));
  const payload: SportsPayload = {
    teams,
    updatedAt: new Date().toISOString(),
  };
  sportsCache = { data: payload, fetchedAt: Date.now() };
  return payload;
}

// ---------------------------------------------------------------------------
// Apple Calendar (.ics / webcal://) real-time parser & SSE stream
// ---------------------------------------------------------------------------

// In-memory demo .ics events so users can also test live updates locally if desired
interface DemoEventRecord {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  isAllDay: boolean;
  location?: string;
}

const nowBase = new Date();
function todayAt(hour: number, minute: number, dayOffset = 0): Date {
  const d = new Date(nowBase.getFullYear(), nowBase.getMonth(), nowBase.getDate() + dayOffset, hour, minute, 0);
  return d;
}

const demoEventsStore: DemoEventRecord[] = [
  {
    uid: 'demo-1@homeview',
    title: 'Morning Coffee & Standup',
    start: todayAt(9, 0, 0),
    end: todayAt(9, 30, 0),
    isAllDay: false,
    location: 'Home Office',
  },
  {
    uid: 'demo-2@homeview',
    title: 'Pick up groceries',
    start: todayAt(17, 30, 0),
    end: todayAt(18, 15, 0),
    isAllDay: false,
    location: 'Trader Joe’s',
  },
  {
    uid: 'demo-3@homeview',
    title: 'Family Dinner',
    start: todayAt(19, 0, 1),
    end: todayAt(20, 30, 1),
    isAllDay: false,
    location: 'Kitchen',
  },
];

function formatIcsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function buildDemoIcsString(): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HomeView Hub//Demo Apple Calendar//EN',
    'X-WR-CALNAME:HomeView Demo',
  ];
  for (const ev of demoEventsStore) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.uid}`);
    lines.push(`DTSTAMP:${formatIcsUtc(new Date())}`);
    lines.push(`DTSTART:${formatIcsUtc(ev.start)}`);
    lines.push(`DTEND:${formatIcsUtc(ev.end)}`);
    lines.push(`SUMMARY:${ev.title.replace(/[\r\n]/g, ' ')}`);
    if (ev.location) {
      lines.push(`LOCATION:${ev.location.replace(/[\r\n]/g, ' ')}`);
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function normalizeCalendarUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('webcal://')) {
    return `https://${trimmed.slice('webcal://'.length)}`;
  }
  if (trimmed.startsWith('webcals://')) {
    return `https://${trimmed.slice('webcals://'.length)}`;
  }
  return trimmed;
}

function isAllowedRemoteUrl(urlStr: string): boolean {
  if (urlStr === 'demo://local') return true;
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    // Block localhost/loopback/link-local unless explicit demo
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('169.254.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function fetchAndParseCalendar(urls: string[]): Promise<CalendarSyncPayload> {
  const cleanUrls = urls.map((u) => u.trim()).filter(Boolean);
  if (cleanUrls.length === 0) {
    return {
      events: [],
      todayEvents: [],
      upcomingEvents: [],
      eventDates: [],
      hash: 'empty',
      sourceCount: 0,
      syncedAt: new Date().toISOString(),
    };
  }

  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth(), 1);
  windowStart.setDate(windowStart.getDate() - 7);
  const windowEnd = new Date(now.getFullYear(), now.getMonth() + 1, 7);

  const allEvents: CalendarEventItem[] = [];
  const errors: string[] = [];

  await Promise.all(
    cleanUrls.map(async (rawUrl, sourceIndex) => {
      const normalized = normalizeCalendarUrl(rawUrl);
      if (!isAllowedRemoteUrl(normalized)) {
        errors.push(`Unsupported or restricted calendar URL: ${rawUrl}`);
        return;
      }

      try {
        let icsText = '';
        if (normalized === 'demo://local') {
          icsText = buildDemoIcsString();
        } else {
          const response = await fetch(normalized, {
            headers: {
              'User-Agent': 'HomeViewHub/1.0 (Apple Calendar Sync)',
              Accept: 'text/calendar, text/plain, */*',
            },
            signal: AbortSignal.timeout(10_000),
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status} from calendar host`);
          }
          icsText = await response.text();
        }

        const parsed = ical.sync.parseICS(icsText);
        let calName: string | undefined;
        for (const item of Object.values(parsed)) {
          if (item && typeof item === 'object' && 'type' in item && item.type === 'VCALENDAR') {
            const rawCal = item as unknown as Record<string, unknown>;
            if (typeof rawCal['WR-CALNAME'] === 'string') {
              calName = rawCal['WR-CALNAME'];
            }
          }
        }

        for (const item of Object.values(parsed)) {
          if (!item || item.type !== 'VEVENT') continue;

          if (item.rrule) {
            const instances = ical.expandRecurringEvent(item, {
              from: windowStart,
              to: windowEnd,
              includeOverrides: true,
              excludeExdates: true,
              expandOngoing: true,
            });
            for (const inst of instances) {
              const title = typeof inst.summary === 'string' && inst.summary.trim()
                ? inst.summary.trim()
                : 'Untitled Event';
              allEvents.push({
                id: `${sourceIndex}:${inst.event.uid}:${inst.start.toISOString()}`,
                uid: inst.event.uid,
                title,
                start: inst.start.toISOString(),
                end: inst.end.toISOString(),
                isAllDay: Boolean(inst.isFullDay),
                location:
                  typeof inst.event.location === 'string' ? inst.event.location : undefined,
                calendarLabel: calName,
                isRecurring: true,
              });
            }
          } else if (item.start) {
            const startDate = new Date(item.start);
            const endDate = item.end ? new Date(item.end) : new Date(startDate.getTime() + 3600_000);
            if (endDate < windowStart || startDate > windowEnd) continue;
            const isAllDay =
              item.datetype === 'date' ||
              (startDate.getHours() === 0 &&
                startDate.getMinutes() === 0 &&
                endDate.getTime() - startDate.getTime() >= 86400_000 - 1000);

            const summaryStr =
              typeof item.summary === 'string'
                ? item.summary
                : item.summary && typeof item.summary === 'object' && 'val' in item.summary
                  ? String((item.summary as { val: unknown }).val)
                  : 'Untitled Event';

            allEvents.push({
              id: `${sourceIndex}:${item.uid || summaryStr}:${startDate.toISOString()}`,
              uid: item.uid || summaryStr,
              title: summaryStr.trim() || 'Untitled Event',
              start: startDate.toISOString(),
              end: endDate.toISOString(),
              isAllDay,
              location: typeof item.location === 'string' ? item.location : undefined,
              calendarLabel: calName,
              isRecurring: false,
            });
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to fetch calendar feed';
        errors.push(msg);
      }
    }),
  );

  // Deduplicate and sort chronologically
  allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const todayKey = formatDateKey(now);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const upcomingCutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14, 23, 59, 59);

  const todayEvents = allEvents.filter((ev) => {
    const s = new Date(ev.start);
    const e = new Date(ev.end);
    return s <= endOfToday && e >= startOfToday;
  });

  const upcomingEvents = allEvents.filter((ev) => {
    const s = new Date(ev.start);
    return s > endOfToday && s <= upcomingCutoff;
  });

  const dateSet = new Set<string>();
  for (const ev of allEvents) {
    const s = new Date(ev.start);
    dateSet.add(formatDateKey(s));
  }
  if (todayEvents.length > 0) {
    dateSet.add(todayKey);
  }

  const hashPayload = JSON.stringify(
    allEvents.map((e) => [e.uid, e.title, e.start, e.end, e.location]),
  );
  const hash = crypto.createHash('sha256').update(hashPayload).digest('hex').slice(0, 16);

  return {
    events: allEvents,
    todayEvents,
    upcomingEvents,
    eventDates: Array.from(dateSet).sort(),
    hash,
    sourceCount: cleanUrls.length,
    syncedAt: new Date().toISOString(),
    error: errors.length > 0 && allEvents.length === 0 ? errors[0] : undefined,
  };
}

const CONFIG_FILE_PATH = path.join(__dirname, '.homeview-config.json');

function getEnvDefaultSettings(): HomeViewSettings {
  const envUrls = (process.env.HOMEVIEW_CALENDAR_URLS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const envLat = Number(process.env.HOMEVIEW_LAT);
  const envLon = Number(process.env.HOMEVIEW_LON);

  return {
    city: process.env.HOMEVIEW_CITY?.trim() || 'Macungie, PA',
    lat: Number.isFinite(envLat) && envLat !== 0 ? envLat : 40.5159,
    lon: Number.isFinite(envLon) && envLon !== 0 ? envLon : -75.5552,
    tempUnit: 'F',
    timeFormat: '12h',
    showSecondsHand: true,
    theme: 'mint',
    calendarUrls: envUrls,
    calendarName: 'Apple Calendar',
    nightDim: false,
  };
}

async function readServerSettings(): Promise<HomeViewSettings> {
  const defaults = getEnvDefaultSettings();
  try {
    const raw = await fs.readFile(CONFIG_FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<HomeViewSettings>;
    const mergedUrls =
      Array.isArray(parsed.calendarUrls) && parsed.calendarUrls.length > 0
        ? parsed.calendarUrls
        : defaults.calendarUrls;
    return {
      ...defaults,
      ...parsed,
      calendarUrls: mergedUrls,
    };
  } catch {
    return defaults;
  }
}

async function writeServerSettings(next: HomeViewSettings): Promise<HomeViewSettings> {
  const defaults = getEnvDefaultSettings();
  const sanitized: HomeViewSettings = {
    ...defaults,
    ...next,
    city: typeof next.city === 'string' && next.city.trim() ? next.city.trim() : defaults.city,
    lat: Number.isFinite(Number(next.lat)) ? Number(next.lat) : defaults.lat,
    lon: Number.isFinite(Number(next.lon)) ? Number(next.lon) : defaults.lon,
    calendarUrls: Array.isArray(next.calendarUrls)
      ? next.calendarUrls.map((u) => String(u).trim()).filter(Boolean)
      : defaults.calendarUrls,
  };
  await fs.writeFile(CONFIG_FILE_PATH, JSON.stringify(sanitized, null, 2), 'utf8');
  return sanitized;
}

// ---------------------------------------------------------------------------
// Express App & Routes
// ---------------------------------------------------------------------------

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.get('/api/settings', async (_req: Request, res: Response) => {
    const current = await readServerSettings();
    res.json(current);
  });

  app.post('/api/settings', async (req: Request, res: Response) => {
    try {
      const saved = await writeServerSettings(req.body as HomeViewSettings);
      res.json(saved);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save settings';
      res.status(500).json({ error: message });
    }
  });

  // Weather endpoint
  app.get('/api/weather', async (req: Request, res: Response) => {
    const lat = Number(req.query.lat ?? 40.5159);
    const lon = Number(req.query.lon ?? -75.5552);
    const city = String(req.query.city || 'Macungie, PA');
    const unit = req.query.unit === 'C' ? 'C' : 'F';

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      res.status(400).json({ error: 'Invalid coordinates' });
      return;
    }

    try {
      const data = await fetchWeather(lat, lon, city, unit);
      res.json(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Weather fetch failed';
      res.status(502).json({ error: message });
    }
  });

  // Weather city search
  app.get('/api/weather/search', async (req: Request, res: Response) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      res.json({ results: [] });
      return;
    }
    try {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`;
      const response = await fetch(geoUrl, { signal: AbortSignal.timeout(6000) });
      if (!response.ok) {
        res.status(502).json({ results: [] });
        return;
      }
      const data = (await response.json()) as {
        results?: Array<{
          id: number;
          name: string;
          admin1?: string;
          country?: string;
          latitude: number;
          longitude: number;
        }>;
      };
      res.json({ results: data.results || [] });
    } catch {
      res.json({ results: [] });
    }
  });

  // Live Sports JSON endpoint
  app.get('/api/sports', async (req: Request, res: Response) => {
    try {
      const force = req.query.force === '1';
      const data = await getSportsPayload(force);
      res.json(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sports fetch failed';
      res.status(502).json({ error: message });
    }
  });

  // Live Sports SSE stream
  app.get('/api/sports/stream', async (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let closed = false;
    let lastHash = '';

    const pushSports = async () => {
      if (closed) return;
      try {
        const payload = await getSportsPayload(false);
        const hash = crypto
          .createHash('sha256')
          .update(
            JSON.stringify(
              payload.teams.map((t) => [
                t.teamKey,
                t.state,
                t.statusText,
                t.homeTeam?.score,
                t.awayTeam?.score,
                t.situation,
              ]),
            ),
          )
          .digest('hex');

        if (hash !== lastHash) {
          lastHash = hash;
          res.write(`event: sports\ndata: ${JSON.stringify(payload)}\n\n`);
        } else {
          res.write(`event: heartbeat\ndata: ${JSON.stringify({ t: Date.now() })}\n\n`);
        }
      } catch {
        // Keep SSE connection alive across transient upstream blips
      }
    };

    await pushSports();
    const interval = setInterval(pushSports, 20_000);

    _req.on('close', () => {
      closed = true;
      clearInterval(interval);
    });
  });

  // Apple Calendar fetch + parse endpoint
  app.get('/api/calendar', async (req: Request, res: Response) => {
    const rawUrls = req.query.urls;
    const urlList = Array.isArray(rawUrls)
      ? rawUrls.map(String)
      : typeof rawUrls === 'string'
        ? rawUrls.split(',').map((s) => decodeURIComponent(s.trim()))
        : [];

    const payload = await fetchAndParseCalendar(urlList);
    res.json(payload);
  });

  // Validate single Apple Calendar URL before saving
  app.post('/api/calendar/validate', async (req: Request, res: Response) => {
    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    if (!url) {
      res.status(400).json({ ok: false, error: 'Please enter a calendar URL.' });
      return;
    }
    const payload = await fetchAndParseCalendar([url]);
    if (payload.error) {
      res.status(400).json({ ok: false, error: payload.error });
      return;
    }
    res.json({
      ok: true,
      eventCount: payload.events.length,
      todayCount: payload.todayEvents.length,
    });
  });

  // Demo .ics endpoint & interactive demo event adder for instant testing
  app.get('/api/calendar/demo.ics', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.send(buildDemoIcsString());
  });

  app.post('/api/calendar/demo-event', (req: Request, res: Response) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const time: string = typeof req.body?.time === 'string' ? req.body.time.trim() : '14:00';
    const location = typeof req.body?.location === 'string' ? req.body.location.trim() : undefined;

    if (!title) {
      res.status(400).json({ error: 'Event title is required' });
      return;
    }

    const [hh, mm] = time.split(':').map((n: string) => Number(n));
    const hour = Number.isFinite(hh) ? hh : 14;
    const min = Number.isFinite(mm) ? mm : 0;
    const start = todayAt(hour, min, 0);
    const end = new Date(start.getTime() + 45 * 60_000);

    demoEventsStore.push({
      uid: `demo-${Date.now()}@homeview`,
      title,
      start,
      end,
      isAllDay: false,
      location,
    });
    res.json({ ok: true, count: demoEventsStore.length });
  });

  // Apple Calendar Real-Time SSE stream
  app.get('/api/calendar/stream', async (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const rawUrls = req.query.urls;
    const urlList = Array.isArray(rawUrls)
      ? rawUrls.map(String)
      : typeof rawUrls === 'string'
        ? rawUrls.split(',').map((s) => decodeURIComponent(s.trim()))
        : [];

    let closed = false;
    let lastHash = '';

    const pushCalendar = async (forceSend = false) => {
      if (closed) return;
      try {
        const payload = await fetchAndParseCalendar(urlList);
        if (forceSend || payload.hash !== lastHash) {
          lastHash = payload.hash;
          res.write(`event: calendar\ndata: ${JSON.stringify(payload)}\n\n`);
        } else {
          res.write(`event: heartbeat\ndata: ${JSON.stringify({ t: Date.now() })}\n\n`);
        }
      } catch {
        res.write(`event: heartbeat\ndata: ${JSON.stringify({ t: Date.now() })}\n\n`);
      }
    };

    await pushCalendar(true);
    // Poll upstream Apple Calendar .ics every 15s and push immediately on change
    const interval = setInterval(() => pushCalendar(false), 15_000);

    req.on('close', () => {
      closed = true;
      clearInterval(interval);
    });
  });

  // Vite middleware in dev, static dist in production
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HomeView Hub server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
