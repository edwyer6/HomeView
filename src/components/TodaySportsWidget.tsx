import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type {
  CompetitorInfo,
  TeamGameSnapshot,
  TeamSportsData,
} from '../types/homeview';

interface TodaySportsWidgetProps {
  teams: TeamSportsData[];
  loading: boolean;
  timeFormat: '12h' | '24h';
}

const ROTATION_INTERVAL_MS = 20_000;

const TEAM_DISPLAY_NAMES: Record<TeamSportsData['teamKey'], string> = {
  lions: 'Detroit Lions',
  devils: 'NJ Devils',
  unc: 'UNC Basketball',
  notredame: 'Notre Dame Football',
};

interface ActiveTodayEntry {
  team: TeamSportsData;
  game: TeamGameSnapshot;
}

function TeamLogo({
  src,
  abbr,
  alt,
  sizeExpr = 'clamp(42px, 6.2vmin, 96px)',
}: {
  src?: string;
  abbr: string;
  alt: string;
  sizeExpr?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className="rounded-2xl flex items-center justify-center font-bold tracking-tight shrink-0 select-none"
        style={{
          width: sizeExpr,
          height: sizeExpr,
          backgroundColor: 'rgba(255,255,255,0.28)',
          color: 'var(--ink-primary)',
          fontSize: `calc(${sizeExpr} * 0.34)`,
        }}
        aria-label={alt}
      >
        {abbr.slice(0, 3)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="object-contain shrink-0 select-none"
      style={{ width: sizeExpr, height: sizeExpr }}
    />
  );
}

function formatGameTime(isoDate: string | undefined, timeFormat: '12h' | '24h'): string {
  if (!isoDate) return 'TBD';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return 'TBD';
  return d.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: timeFormat === '12h',
  });
}

function formatNextGameShort(isoDate: string | undefined, timeFormat: '12h' | '24h'): string {
  if (!isoDate) return 'TBD';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return 'TBD';
  const day = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const time = formatGameTime(isoDate, timeFormat);
  return `${day} · ${time}`;
}

function LandscapeCompetitor({
  competitor,
  isFocusTeam,
  showScore,
  isFinished,
  alignRight = false,
}: {
  competitor: CompetitorInfo;
  isFocusTeam: boolean;
  showScore: boolean;
  isFinished: boolean;
  alignRight?: boolean;
}) {
  const dimmed = isFinished && competitor.winner === false;
  return (
    <div
      className={`flex items-center gap-[clamp(10px,1.5vmin,24px)] min-w-0 ${
        alignRight ? 'flex-row-reverse text-right' : 'flex-row text-left'
      }`}
      style={{ opacity: dimmed ? 0.6 : 1 }}
    >
      <TeamLogo
        src={competitor.logo}
        abbr={competitor.abbreviation}
        alt={competitor.name}
        sizeExpr="clamp(44px, 6.8vmin, 108px)"
      />

      <div className="min-w-0 flex-1">
        <div
          className={`flex items-baseline gap-1.5 ${
            alignRight ? 'justify-end' : 'justify-start'
          }`}
        >
          {competitor.rank && (
            <span
              className="font-semibold tabular-nums shrink-0"
              style={{
                color: 'var(--ink-secondary)',
                fontSize: 'clamp(12px, 1.6vmin, 24px)',
              }}
            >
              #{competitor.rank}
            </span>
          )}
          <span
            className={`tracking-tight truncate ${
              isFocusTeam ? 'font-bold' : 'font-semibold'
            }`}
            style={{
              color: 'var(--ink-primary)',
              fontSize: 'clamp(16px, 2.45vmin, 38px)',
            }}
          >
            {competitor.shortName || competitor.abbreviation}
          </span>
        </div>
        {competitor.record && (
          <div
            className="font-medium tabular-nums"
            style={{
              color: 'var(--ink-secondary)',
              fontSize: 'clamp(11px, 1.5vmin, 22px)',
            }}
          >
            {competitor.record}
          </div>
        )}
      </div>

      {showScore && (
        <span
          className="leading-none font-bold tabular-nums tracking-tight shrink-0 px-1"
          style={{
            color: 'var(--ink-primary)',
            fontSize: 'clamp(2.25rem, 5.8vmin, 6.5rem)',
          }}
        >
          {competitor.score}
        </span>
      )}
    </div>
  );
}

export function TodaySportsWidget({
  teams,
  loading,
  timeFormat,
}: TodaySportsWidgetProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [tickAnchor, setTickAnchor] = useState(() => Date.now());

  const todaysGames = useMemo<ActiveTodayEntry[]>(() => {
    const todayStr = new Date().toDateString();
    const matches: ActiveTodayEntry[] = [];

    for (const team of teams) {
      const candidates = team.candidateGames?.length
        ? team.candidateGames
        : team.state !== 'offseason'
          ? [
              {
                eventId: team.teamKey,
                state: team.state,
                statusText: team.statusText,
                statusDetail: team.statusDetail,
                gameDate: team.gameDate,
                broadcast: team.broadcast,
                venue: team.venue,
                situation: team.situation,
                homeTeam: team.homeTeam,
                awayTeam: team.awayTeam,
              },
            ]
          : [];

      const liveGame = candidates.find((g) => g.state === 'in');
      const todayGame =
        liveGame ||
        candidates.find(
          (g) => g.gameDate && new Date(g.gameDate).toDateString() === todayStr,
        );

      if (todayGame) {
        matches.push({ team, game: todayGame });
      }
    }

    matches.sort((a, b) => {
      if (a.game.state === 'in' && b.game.state !== 'in') return -1;
      if (b.game.state === 'in' && a.game.state !== 'in') return 1;
      return (
        new Date(a.game.gameDate || 0).getTime() -
        new Date(b.game.gameDate || 0).getTime()
      );
    });

    return matches;
  }, [teams]);

  useEffect(() => {
    if (todaysGames.length === 0) {
      setActiveIndex(0);
    } else if (activeIndex >= todaysGames.length) {
      setActiveIndex(0);
    }
  }, [todaysGames.length, activeIndex]);

  useEffect(() => {
    if (todaysGames.length <= 1) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % todaysGames.length);
      setTickAnchor(Date.now());
    }, ROTATION_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [todaysGames.length, tickAnchor]);

  const selectIndex = (nextIdx: number) => {
    if (todaysGames.length === 0) return;
    const wrapped = (nextIdx + todaysGames.length) % todaysGames.length;
    setActiveIndex(wrapped);
    setTickAnchor(Date.now());
  };

  if (loading && teams.length === 0) {
    return (
      <section className="homeview-widget flex flex-col justify-between h-full min-h-[220px] md:min-h-0">
        <div className="h-5 w-44 rounded-lg bg-black/10 animate-pulse" />
        <div className="grid grid-cols-2 gap-6 my-4">
          <div className="h-14 rounded-2xl bg-black/10 animate-pulse" />
          <div className="h-14 rounded-2xl bg-black/10 animate-pulse" />
        </div>
        <div className="h-4 w-36 rounded bg-black/10 animate-pulse" />
      </section>
    );
  }

  if (todaysGames.length === 0) {
    return (
      <section
        aria-label="Today's Sports"
        className="homeview-widget flex flex-col justify-between h-full min-h-[220px] md:min-h-0"
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className="font-bold tracking-tight"
            style={{
              color: 'var(--ink-inverse)',
              fontSize: 'clamp(16px, 2.2vmin, 34px)',
            }}
          >
            Today’s Games
          </span>
          <span
            className="font-semibold"
            style={{
              color: 'var(--ink-secondary)',
              fontSize: 'clamp(12px, 1.55vmin, 23px)',
            }}
          >
            No teams playing today
          </span>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-2 gap-x-[clamp(16px,2.5vmin,40px)] gap-y-[clamp(8px,1.2vmin,20px)] content-center py-1">
          {teams.map((t) => (
            <div key={t.teamKey} className="flex items-center gap-[clamp(10px,1.2vmin,18px)] min-w-0">
              <TeamLogo
                src={t.teamLogo}
                abbr={t.teamAbbr}
                alt={t.teamName}
                sizeExpr="clamp(28px, 3.8vmin, 56px)"
              />
              <div className="min-w-0">
                <div
                  className="font-bold truncate"
                  style={{
                    color: 'var(--ink-primary)',
                    fontSize: 'clamp(12px, 1.65vmin, 24px)',
                  }}
                >
                  {TEAM_DISPLAY_NAMES[t.teamKey]}
                </div>
                <div
                  className="font-medium tabular-nums truncate"
                  style={{
                    color: 'var(--ink-secondary)',
                    fontSize: 'clamp(11px, 1.4vmin, 20px)',
                  }}
                >
                  {t.state === 'pre'
                    ? `Next: ${formatNextGameShort(t.gameDate, timeFormat)}`
                    : t.lastGameSummary || t.statusText}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div
          className="pt-[clamp(8px,1.1vmin,16px)] font-medium shrink-0"
          style={{
            color: 'var(--ink-muted)',
            borderTop: '1px solid var(--hairline)',
            fontSize: 'clamp(11px, 1.35vmin, 20px)',
          }}
        >
          Monitoring Lions, NJ Devils, UNC Basketball, and Notre Dame Football
        </div>
      </section>
    );
  }

  const current = todaysGames[activeIndex] || todaysGames[0];
  const { team, game } = current;
  const isLive = game.state === 'in';
  const isPost = game.state === 'post';
  const showScores = isLive || isPost;

  return (
    <section
      aria-label="Today's Live Sports"
      className="homeview-widget flex flex-col justify-between h-full min-h-[220px] md:min-h-0"
    >
      {/* Header with Team Identity & 20s Rotation Controls */}
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <span
            className="font-bold tracking-tight truncate"
            style={{
              color: 'var(--ink-inverse)',
              fontSize: 'clamp(16px, 2.2vmin, 34px)',
            }}
          >
            {team.rank ? `#${team.rank} ` : ''}
            {TEAM_DISPLAY_NAMES[team.teamKey]}
          </span>
          <span
            className="font-semibold tabular-nums whitespace-nowrap"
            style={{
              color: 'var(--ink-secondary)',
              fontSize: 'clamp(12px, 1.55vmin, 23px)',
            }}
          >
            {team.leagueLabel}
            {team.record ? ` · ${team.record}` : ''}
          </span>
        </div>

        {todaysGames.length > 1 && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => selectIndex(activeIndex - 1)}
              aria-label="Previous game today"
              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
              style={{ color: 'var(--ink-primary)' }}
            >
              <ChevronLeft className="w-[clamp(16px,1.9vmin,26px)] h-[clamp(16px,1.9vmin,26px)]" />
            </button>

            <div className="flex items-center gap-1.5 px-1">
              {todaysGames.map((entry, idx) => (
                <button
                  key={entry.team.teamKey}
                  type="button"
                  onClick={() => selectIndex(idx)}
                  aria-label={`Show ${TEAM_DISPLAY_NAMES[entry.team.teamKey]}`}
                  className="rounded-full transition-all"
                  style={{
                    height: 'clamp(7px, 0.9vmin, 12px)',
                    width:
                      idx === activeIndex
                        ? 'clamp(16px, 2.2vmin, 30px)'
                        : 'clamp(7px, 0.9vmin, 12px)',
                    backgroundColor:
                      idx === activeIndex
                        ? 'var(--accent-pill-bg)'
                        : 'rgba(19, 34, 26, 0.28)',
                  }}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => selectIndex(activeIndex + 1)}
              aria-label="Next game today"
              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
              style={{ color: 'var(--ink-primary)' }}
            >
              <ChevronRight className="w-[clamp(16px,1.9vmin,26px)] h-[clamp(16px,1.9vmin,26px)]" />
            </button>
          </div>
        )}
      </div>

      {/* Landscape Matchup Row */}
      <div className="flex-1 min-h-0 flex flex-col justify-center py-2">
        <div className="flex items-center justify-between gap-2 mb-[clamp(10px,1.4vmin,22px)]">
          <div className="flex items-center gap-2">
            {isLive && (
              <span
                className="inline-block rounded-full bg-[#E11D48] animate-pulse"
                style={{
                  width: 'clamp(8px, 1vmin, 14px)',
                  height: 'clamp(8px, 1vmin, 14px)',
                }}
              />
            )}
            <span
              className="font-bold tracking-tight"
              style={{
                color: 'var(--ink-primary)',
                fontSize: 'clamp(13px, 1.75vmin, 26px)',
              }}
            >
              {isLive
                ? `Live · ${game.statusText}`
                : isPost
                  ? game.statusText
                  : `Today · ${formatGameTime(game.gameDate, timeFormat)}`}
            </span>
          </div>

          {game.broadcast && (
            <span
              className="font-semibold"
              style={{
                color: 'var(--ink-secondary)',
                fontSize: 'clamp(12px, 1.6vmin, 24px)',
              }}
            >
              {game.broadcast}
            </span>
          )}
        </div>

        {game.awayTeam && game.homeTeam ? (
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-[clamp(10px,1.5vmin,24px)]">
            <LandscapeCompetitor
              competitor={game.awayTeam}
              isFocusTeam={game.awayTeam.abbreviation === team.teamAbbr}
              showScore={showScores}
              isFinished={isPost}
            />

            <span
              className="hidden sm:inline font-bold uppercase tracking-wider text-center px-1"
              style={{
                color: 'var(--ink-muted)',
                fontSize: 'clamp(12px, 1.5vmin, 22px)',
              }}
            >
              @
            </span>

            <LandscapeCompetitor
              competitor={game.homeTeam}
              isFocusTeam={game.homeTeam.abbreviation === team.teamAbbr}
              showScore={showScores}
              isFinished={isPost}
              alignRight={true}
            />
          </div>
        ) : (
          <div
            className="font-bold"
            style={{
              color: 'var(--ink-primary)',
              fontSize: 'clamp(18px, 2.5vmin, 36px)',
            }}
          >
            {game.statusDetail}
          </div>
        )}

        {isLive && game.situation && (
          <p
            className="font-medium truncate mt-[clamp(8px,1.2vmin,18px)]"
            style={{
              color: 'var(--ink-secondary)',
              fontSize: 'clamp(12px, 1.5vmin, 22px)',
            }}
          >
            {game.situation}
          </p>
        )}
      </div>

      {/* Footer */}
      <div
        className="pt-[clamp(8px,1.1vmin,16px)] shrink-0 flex items-center justify-between gap-3 font-medium"
        style={{
          borderTop: '1px solid var(--hairline)',
          color: 'var(--ink-secondary)',
          fontSize: 'clamp(11px, 1.35vmin, 20px)',
        }}
      >
        <span className="truncate">
          {game.venue || team.standingSummary || team.lastGameSummary || team.teamName}
        </span>

        {todaysGames.length > 1 ? (
          <span className="tabular-nums whitespace-nowrap shrink-0">
            Playing today ({activeIndex + 1}/{todaysGames.length}) · 20s rotation
          </span>
        ) : (
          team.lastGameSummary && (
            <span className="whitespace-nowrap shrink-0">{team.lastGameSummary}</span>
          )
        )}
      </div>
    </section>
  );
}
