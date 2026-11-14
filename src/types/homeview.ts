export type ThemePreset = 'mint' | 'sky' | 'sand' | 'night';

export interface HomeViewSettings {
  city: string;
  lat: number;
  lon: number;
  tempUnit: 'F' | 'C';
  timeFormat: '12h' | '24h';
  showSecondsHand: boolean;
  theme: ThemePreset;
  calendarUrls: string[];
  calendarName: string;
  nightDim: boolean;
}

export interface WeatherForecastSlot {
  time: string;
  temp: number;
  weatherCode: number;
}

export interface WeatherData {
  city: string;
  region?: string;
  temp: number;
  feelsLike: number;
  high: number;
  low: number;
  weatherCode: number;
  condition: string;
  windSpeed: number;
  humidity: number;
  isDay: boolean;
  unit: 'F' | 'C';
  hourly: WeatherForecastSlot[];
  updatedAt: string;
}

export interface CitySearchResult {
  id: number;
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

export type SportLeague = 'nfl' | 'nhl' | 'ncaam' | 'ncaaf';
export type GameState = 'pre' | 'in' | 'post' | 'offseason';

export interface CompetitorInfo {
  id: string;
  abbreviation: string;
  name: string;
  shortName: string;
  logo: string;
  score: string;
  homeAway: 'home' | 'away';
  winner?: boolean;
  rank?: number;
  record?: string;
}

export interface TeamGameSnapshot {
  eventId: string;
  state: GameState;
  statusText: string;
  statusDetail: string;
  gameDate?: string;
  broadcast?: string;
  venue?: string;
  situation?: string;
  homeTeam?: CompetitorInfo;
  awayTeam?: CompetitorInfo;
}

export interface TeamSportsData {
  teamKey: 'lions' | 'devils' | 'unc' | 'notredame';
  league: SportLeague;
  leagueLabel: string;
  teamName: string;
  teamShortName: string;
  teamAbbr: string;
  teamLogo: string;
  teamColor: string;
  record: string;
  rank?: number;
  standingSummary?: string;
  state: GameState;
  statusText: string;
  statusDetail: string;
  gameDate?: string;
  broadcast?: string;
  venue?: string;
  situation?: string;
  homeTeam?: CompetitorInfo;
  awayTeam?: CompetitorInfo;
  lastGameSummary?: string;
  candidateGames: TeamGameSnapshot[];
  updatedAt: string;
}

export interface SportsPayload {
  teams: TeamSportsData[];
  updatedAt: string;
}

export interface CalendarEventItem {
  id: string;
  uid: string;
  title: string;
  start: string;
  end: string;
  isAllDay: boolean;
  location?: string;
  calendarLabel?: string;
  isRecurring?: boolean;
}

export interface CalendarSyncPayload {
  events: CalendarEventItem[];
  todayEvents: CalendarEventItem[];
  upcomingEvents: CalendarEventItem[];
  eventDates: string[];
  hash: string;
  sourceCount: number;
  syncedAt: string;
  error?: string;
}
