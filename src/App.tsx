import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, SlidersHorizontal } from 'lucide-react';
import { AnalogClockWidget } from './components/AnalogClockWidget';
import { CalendarGridWidget, formatDateKey } from './components/CalendarGridWidget';
import { CalendarScheduleWidget } from './components/CalendarScheduleWidget';
import { SettingsModal } from './components/SettingsModal';
import { TodaySportsWidget } from './components/TodaySportsWidget';
import { WeatherWidget } from './components/WeatherWidget';
import type {
  CalendarSyncPayload,
  HomeViewSettings,
  SportsPayload,
  WeatherData,
} from './types/homeview';

const STORAGE_KEY = 'homeview_hub_settings_v1';

const DEFAULT_SETTINGS: HomeViewSettings = {
  city: 'Macungie, PA',
  lat: 40.5159,
  lon: -75.5552,
  tempUnit: 'F',
  timeFormat: '12h',
  showSecondsHand: true,
  theme: 'mint',
  calendarUrls: [],
  calendarName: 'Apple Calendar',
  nightDim: false,
};

function loadSettings(): HomeViewSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<HomeViewSettings>;
    const merged: HomeViewSettings = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      calendarUrls: Array.isArray(parsed.calendarUrls) ? parsed.calendarUrls : [],
    };
    if (merged.city === 'Kalamazoo' && merged.lat === 42.2917 && merged.lon === -85.5872) {
      merged.city = DEFAULT_SETTINGS.city;
      merged.lat = DEFAULT_SETTINGS.lat;
      merged.lon = DEFAULT_SETTINGS.lon;
    }
    return merged;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export default function App() {
  const [settings, setSettings] = useState<HomeViewSettings>(loadSettings);

  // Weather state
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  // Sports state (Detroit Lions, NJ Devils, UNC Men's Basketball, Notre Dame Football)
  const [sports, setSports] = useState<SportsPayload | null>(null);
  const [sportsLoading, setSportsLoading] = useState(true);

  // Apple Calendar real-time state & selected day sync between Grid & Schedule widgets
  const [calendar, setCalendar] = useState<CalendarSyncPayload | null>(null);
  const [calendarSyncing, setCalendarSyncing] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState<string>(() => formatDateKey(new Date()));

  // Settings modal & Fullscreen
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'calendar' | 'weather' | 'display'>('calendar');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const handleSaveSettings = useCallback((next: HomeViewSettings) => {
    setSettings(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    }).catch(() => {
      // ignore offline save error; localStorage still persists locally
    });
  }, []);

  // Hydrate permanent server settings (location, Apple Calendar URLs, env defaults)
  useEffect(() => {
    let active = true;
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((serverCfg: HomeViewSettings | null) => {
        if (!active || !serverCfg) return;
        setSettings((prev) => {
          const hasLocalRaw = Boolean(localStorage.getItem(STORAGE_KEY));
          const mergedUrls =
            prev.calendarUrls.length > 0
              ? prev.calendarUrls
              : Array.isArray(serverCfg.calendarUrls)
                ? serverCfg.calendarUrls
                : [];
          const next: HomeViewSettings = hasLocalRaw
            ? { ...prev, calendarUrls: mergedUrls }
            : { ...DEFAULT_SETTINGS, ...serverCfg, calendarUrls: mergedUrls };
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {
            // ignore
          }
          return next;
        });
      })
      .catch(() => {
        // ignore
      });
    return () => {
      active = false;
    };
  }, []);

  // Apply theme attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  // Fetch Weather + 10-minute refresh
  const fetchWeatherNow = useCallback(async () => {
    setWeatherLoading((prev) => (weather ? prev : true));
    try {
      const params = new URLSearchParams({
        lat: String(settings.lat),
        lon: String(settings.lon),
        city: settings.city,
        unit: settings.tempUnit,
      });
      const res = await fetch(`/api/weather?${params.toString()}`);
      if (!res.ok) throw new Error('Weather unavailable');
      const data = (await res.json()) as WeatherData;
      setWeather(data);
      setWeatherError(null);
    } catch (err) {
      setWeatherError(err instanceof Error ? err.message : 'Weather unavailable');
    } finally {
      setWeatherLoading(false);
    }
  }, [settings.lat, settings.lon, settings.city, settings.tempUnit]);

  useEffect(() => {
    fetchWeatherNow();
    const timer = setInterval(fetchWeatherNow, 10 * 60_000);
    return () => clearInterval(timer);
  }, [fetchWeatherNow]);

  // Live Sports SSE stream + initial fetch
  useEffect(() => {
    let active = true;

    fetch('/api/sports')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: SportsPayload | null) => {
        if (active && data) {
          setSports(data);
          setSportsLoading(false);
        }
      })
      .catch(() => {
        if (active) setSportsLoading(false);
      });

    const es = new EventSource('/api/sports/stream');
    es.addEventListener('sports', (event) => {
      if (!active) return;
      try {
        const data = JSON.parse((event as MessageEvent).data) as SportsPayload;
        setSports(data);
        setSportsLoading(false);
      } catch {
        // ignore parse errors
      }
    });
    es.onerror = () => {
      if (active) setSportsLoading(false);
    };

    return () => {
      active = false;
      es.close();
    };
  }, []);

  // Apple Calendar Real-Time SSE stream
  const fetchCalendarNow = useCallback(async () => {
    if (settings.calendarUrls.length === 0) {
      setCalendar(null);
      return;
    }
    setCalendarSyncing(true);
    try {
      const encoded = settings.calendarUrls.map((u) => encodeURIComponent(u)).join(',');
      const res = await fetch(`/api/calendar?urls=${encoded}`);
      if (res.ok) {
        const data = (await res.json()) as CalendarSyncPayload;
        setCalendar(data);
      }
    } finally {
      setCalendarSyncing(false);
    }
  }, [settings.calendarUrls]);

  useEffect(() => {
    if (settings.calendarUrls.length === 0) {
      setCalendar(null);
      return;
    }

    const encoded = settings.calendarUrls.map((u) => encodeURIComponent(u)).join(',');
    const es = new EventSource(`/api/calendar/stream?urls=${encoded}`);

    es.addEventListener('calendar', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as CalendarSyncPayload;
        setCalendar(data);
      } catch {
        // ignore
      }
    });

    return () => {
      es.close();
    };
  }, [settings.calendarUrls]);

  // Keep selected date synced to today after midnight rollover
  useEffect(() => {
    const id = setInterval(() => {
      const todayKey = formatDateKey(new Date());
      setSelectedDateKey((prev) => (prev < todayKey ? todayKey : prev));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  // Fullscreen listener
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await rootRef.current?.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch {
      // Safari on older iPads uses Add to Home Screen for fullscreen
    }
  };

  return (
    <div
      ref={rootRef}
      className="homeview-canvas relative flex flex-col md:h-[100dvh] md:overflow-hidden"
      style={{ padding: 'clamp(12px, 2vmin, 36px)' }}
    >
      {/* Minimal top strip */}
      <header
        className="w-full mx-auto flex items-center justify-between shrink-0"
        style={{ paddingBottom: 'clamp(10px, 1.4vmin, 24px)' }}
      >
        <span
          className="font-semibold tracking-tight pl-1"
          style={{
            color: 'var(--ink-secondary)',
            fontSize: 'clamp(13px, 1.5vmin, 22px)',
          }}
        >
          HomeView
        </span>

        <div className="flex items-center gap-2">
          {typeof document !== 'undefined' && document.fullscreenEnabled && (
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen mode'}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition-opacity hover:opacity-100 opacity-85 focus-visible:outline-2 focus-visible:outline-white"
              style={{
                backgroundColor: 'var(--widget-bg)',
                border: '1px solid var(--widget-border)',
                color: 'var(--ink-primary)',
              }}
            >
              {isFullscreen ? (
                <Minimize2 className="w-[clamp(16px,1.7vmin,24px)] h-[clamp(16px,1.7vmin,24px)]" />
              ) : (
                <Maximize2 className="w-[clamp(16px,1.7vmin,24px)] h-[clamp(16px,1.7vmin,24px)]" />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setSettingsTab('calendar');
              setSettingsOpen(true);
            }}
            aria-label="Open HomeView settings"
            title="Settings"
            className="min-w-[44px] min-h-[44px] px-3.5 flex items-center justify-center gap-2 rounded-full font-semibold transition-opacity hover:opacity-100 opacity-90 focus-visible:outline-2 focus-visible:outline-white"
            style={{
              backgroundColor: 'var(--widget-bg)',
              border: '1px solid var(--widget-border)',
              color: 'var(--ink-primary)',
              fontSize: 'clamp(12px, 1.35vmin, 18px)',
            }}
          >
            <SlidersHorizontal className="w-[clamp(15px,1.6vmin,22px)] h-[clamp(15px,1.6vmin,22px)]" />
            <span className="hidden sm:inline">Customize</span>
          </button>
        </div>
      </header>

      {/* Landscape 6-column x 2-row Grid: fills entire screen proportionally */}
      <main
        className="flex-1 min-h-0 w-full mx-auto grid grid-cols-1 md:grid-cols-6 md:grid-rows-2"
        style={{ gap: 'clamp(12px, 1.9vmin, 32px)' }}
      >
        <div className="md:col-span-2 min-h-0">
          <AnalogClockWidget
            timeFormat={settings.timeFormat}
            showSecondsHand={settings.showSecondsHand}
          />
        </div>

        <div className="md:col-span-2 min-h-0">
          <WeatherWidget
            weather={weather}
            loading={weatherLoading}
            error={weatherError}
            onOpenLocationSettings={() => {
              setSettingsTab('weather');
              setSettingsOpen(true);
            }}
          />
        </div>

        <div className="md:col-span-2 min-h-0">
          <CalendarGridWidget
            calendar={calendar}
            selectedDateKey={selectedDateKey}
            onSelectDate={setSelectedDateKey}
          />
        </div>

        <div className="md:col-span-3 min-h-0">
          <CalendarScheduleWidget
            calendar={calendar}
            hasCalendarUrl={settings.calendarUrls.length > 0}
            syncing={calendarSyncing}
            selectedDateKey={selectedDateKey}
            timeFormat={settings.timeFormat}
            onResetToToday={() => setSelectedDateKey(formatDateKey(new Date()))}
            onOpenCalendarSettings={() => {
              setSettingsTab('calendar');
              setSettingsOpen(true);
            }}
            onManualSync={fetchCalendarNow}
          />
        </div>

        <div className="md:col-span-3 min-h-0">
          <TodaySportsWidget
            teams={sports?.teams || []}
            loading={sportsLoading}
            timeFormat={settings.timeFormat}
          />
        </div>
      </main>

      <SettingsModal
        isOpen={settingsOpen}
        initialTab={settingsTab}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSaveSettings={handleSaveSettings}
        onForceCalendarSync={fetchCalendarNow}
      />
    </div>
  );
}
