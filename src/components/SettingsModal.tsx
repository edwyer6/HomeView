import { useEffect, useState } from 'react';
import {
  Calendar,
  Check,
  LocateFixed,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type {
  CitySearchResult,
  HomeViewSettings,
  ThemePreset,
} from '../types/homeview';

interface SettingsModalProps {
  isOpen: boolean;
  initialTab?: 'calendar' | 'weather' | 'display';
  settings: HomeViewSettings;
  onClose: () => void;
  onSaveSettings: (next: HomeViewSettings) => void;
  onForceCalendarSync: () => void;
}

const THEMES: Array<{ id: ThemePreset; label: string; swatch: string }> = [
  { id: 'mint', label: 'Mint Hub', swatch: '#86dda4' },
  { id: 'sky', label: 'Sky Mist', swatch: '#8fc9f0' },
  { id: 'sand', label: 'Warm Sand', swatch: '#ead5b7' },
  { id: 'night', label: 'Night StandBy', swatch: '#101c17' },
];

export function SettingsModal({
  isOpen,
  initialTab = 'calendar',
  settings,
  onClose,
  onSaveSettings,
  onForceCalendarSync,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'calendar' | 'weather' | 'display'>(initialTab);
  const [newCalUrl, setNewCalUrl] = useState('');
  const [calValidating, setCalValidating] = useState(false);
  const [calFeedback, setCalFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  );

  // Demo quick-event adder when demo://local is active
  const [demoTitle, setDemoTitle] = useState('');
  const [demoTime, setDemoTime] = useState('15:30');
  const [demoAddedMsg, setDemoAddedMsg] = useState<string | null>(null);

  // Weather city search
  const [cityQuery, setCityQuery] = useState('');
  const [cityResults, setCityResults] = useState<CitySearchResult[]>([]);
  const [searchingCity, setSearchingCity] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setCalFeedback(null);
      setDemoAddedMsg(null);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    const q = cityQuery.trim();
    if (q.length < 2) {
      setCityResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingCity(true);
      try {
        const res = await fetch(`/api/weather/search?q=${encodeURIComponent(q)}`);
        const data = (await res.json()) as { results?: CitySearchResult[] };
        setCityResults(data.results || []);
      } catch {
        setCityResults([]);
      } finally {
        setSearchingCity(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [cityQuery]);

  if (!isOpen) return null;

  const hasDemoCal = settings.calendarUrls.includes('demo://local');

  const handleAddCalendarUrl = async () => {
    const trimmed = newCalUrl.trim();
    if (!trimmed) return;
    if (settings.calendarUrls.includes(trimmed)) {
      setCalFeedback({ type: 'err', text: 'This calendar URL is already connected.' });
      return;
    }

    setCalValidating(true);
    setCalFeedback(null);
    try {
      const res = await fetch('/api/calendar/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        eventCount?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setCalFeedback({
          type: 'err',
          text: data.error || 'Could not read Apple Calendar feed.',
        });
        return;
      }

      onSaveSettings({
        ...settings,
        calendarUrls: [...settings.calendarUrls, trimmed],
      });
      setNewCalUrl('');
      setCalFeedback({
        type: 'ok',
        text: `Connected · ${data.eventCount ?? 0} events synced in real time`,
      });
    } catch {
      setCalFeedback({ type: 'err', text: 'Network error validating calendar URL.' });
    } finally {
      setCalValidating(false);
    }
  };

  const handleRemoveCalendarUrl = (urlToRemove: string) => {
    onSaveSettings({
      ...settings,
      calendarUrls: settings.calendarUrls.filter((u) => u !== urlToRemove),
    });
  };

  const handleEnableDemoCalendar = () => {
    if (hasDemoCal) return;
    onSaveSettings({
      ...settings,
      calendarUrls: [...settings.calendarUrls, 'demo://local'],
    });
    setCalFeedback({
      type: 'ok',
      text: 'Demo iCal feed active · add events below to test live SSE sync',
    });
  };

  const handleAddDemoEvent = async () => {
    if (!demoTitle.trim()) return;
    try {
      const res = await fetch('/api/calendar/demo-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: demoTitle.trim(), time: demoTime }),
      });
      if (res.ok) {
        setDemoTitle('');
        setDemoAddedMsg('Added to live iCal feed');
        onForceCalendarSync();
      }
    } catch {
      // ignore
    }
  };

  const handleUseGeolocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lon = Number(pos.coords.longitude.toFixed(4));
        onSaveSettings({
          ...settings,
          city: 'Current Location',
          lat,
          lon,
        });
        setLocating(false);
      },
      () => {
        setLocating(false);
      },
      { timeout: 8000 },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="HomeView Settings"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-[28px] bg-white text-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold tracking-tight text-slate-900">
            HomeView Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Segmented Tabs */}
        <div className="px-6 pt-4">
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-2xl">
            {(
              [
                { id: 'calendar', label: 'Apple Calendar' },
                { id: 'weather', label: 'Weather' },
                { id: 'display', label: 'Display' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[44px] px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'calendar' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Real-Time Apple Calendar Sync
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Paste your iCloud Calendar public link (<code className="font-mono">webcal://</code> or{' '}
                  <code className="font-mono">https://</code> .ics). HomeView streams updates
                  live via Server-Sent Events whenever your Apple Calendar changes.
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-xs text-slate-700 space-y-1.5">
                <div className="font-semibold text-slate-900">
                  How to get your Apple Calendar link:
                </div>
                <p>1. Open the Calendar app on your iPhone, iPad, or Mac (or iCloud.com).</p>
                <p>2. Tap Calendars, tap the (i) icon next to a calendar, and turn on Public Calendar.</p>
                <p>3. Tap Share Link, copy the <code className="font-mono">webcal://</code> URL, and paste it below.</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  value={newCalUrl}
                  onChange={(e) => setNewCalUrl(e.target.value)}
                  placeholder="webcal://p123-caldav.icloud.com/published/2/..."
                  className="flex-1 min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
                />
                <button
                  type="button"
                  onClick={handleAddCalendarUrl}
                  disabled={calValidating || !newCalUrl.trim()}
                  className="min-h-[44px] px-4 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>{calValidating ? 'Verifying...' : 'Connect'}</span>
                </button>
              </div>

              {calFeedback && (
                <p
                  className={`text-xs font-medium ${
                    calFeedback.type === 'ok' ? 'text-emerald-700' : 'text-rose-600'
                  }`}
                >
                  {calFeedback.text}
                </p>
              )}

              {/* Connected feeds list */}
              {settings.calendarUrls.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-700">
                    Connected Calendars ({settings.calendarUrls.length})
                  </div>
                  <ul className="divide-y divide-slate-200 border border-slate-200 rounded-2xl overflow-hidden">
                    {settings.calendarUrls.map((url) => (
                      <li
                        key={url}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Calendar className="w-4 h-4 text-emerald-700 shrink-0" />
                          <span className="text-xs font-mono text-slate-700 truncate">
                            {url === 'demo://local' ? 'Built-in Live Demo Calendar (.ics)' : url}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveCalendarUrl(url)}
                          aria-label="Remove calendar"
                          className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Instant Live Demo .ics option */}
              <div className="pt-2 border-t border-slate-200 space-y-3">
                {!hasDemoCal ? (
                  <button
                    type="button"
                    onClick={handleEnableDemoCalendar}
                    className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    Try Built-In Live .ics Demo Calendar
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-800">
                      Test Real-Time Sync (Adds event directly to live .ics feed)
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={demoTitle}
                        onChange={(e) => setDemoTitle(e.target.value)}
                        placeholder="New event title (e.g. Lions Watch Party)"
                        className="flex-1 min-h-[44px] px-3 rounded-xl border border-slate-300 text-xs text-slate-900"
                      />
                      <input
                        type="time"
                        value={demoTime}
                        onChange={(e) => setDemoTime(e.target.value)}
                        className="min-h-[44px] px-3 rounded-xl border border-slate-300 text-xs text-slate-900 tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={handleAddDemoEvent}
                        className="min-h-[44px] px-4 rounded-xl bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 whitespace-nowrap"
                      >
                        Add Event
                      </button>
                    </div>
                    {demoAddedMsg && (
                      <p className="text-xs font-medium text-emerald-700">{demoAddedMsg}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'weather' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Weather Location</h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Currently showing {settings.city}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleUseGeolocation}
                  disabled={locating}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <LocateFixed className="w-4 h-4" />
                  <span>{locating ? 'Locating...' : 'Use GPS'}</span>
                </button>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={cityQuery}
                  onChange={(e) => setCityQuery(e.target.value)}
                  placeholder="Search city (e.g. Detroit, Newark, Chapel Hill, Kalamazoo)..."
                  className="w-full min-h-[44px] pl-10 pr-4 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              {searchingCity && (
                <p className="text-xs text-slate-500">Searching cities...</p>
              )}

              {cityResults.length > 0 && (
                <ul className="divide-y divide-slate-200 border border-slate-200 rounded-2xl overflow-hidden">
                  {cityResults.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onSaveSettings({
                            ...settings,
                            city: item.name,
                            lat: item.latitude,
                            lon: item.longitude,
                          });
                          setCityQuery('');
                          setCityResults([]);
                        }}
                        className="w-full min-h-[44px] px-4 py-2.5 text-left hover:bg-slate-50 flex items-center justify-between gap-2"
                      >
                        <span className="text-sm font-semibold text-slate-900">
                          {item.name}
                          <span className="font-normal text-slate-500">
                            {item.admin1 ? `, ${item.admin1}` : ''}
                            {item.country ? ` · ${item.country}` : ''}
                          </span>
                        </span>
                        {settings.city === item.name && (
                          <Check className="w-4 h-4 text-emerald-700 shrink-0" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">
                  Temperature Unit
                </span>
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                  {(['F', 'C'] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => onSaveSettings({ ...settings, tempUnit: u })}
                      className={`min-h-[40px] px-4 rounded-lg text-xs font-bold transition-colors ${
                        settings.tempUnit === u
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600'
                      }`}
                    >
                      °{u}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'display' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-3">
                  HomeView Canvas Theme
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {THEMES.map((theme) => {
                    const active = settings.theme === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => onSaveSettings({ ...settings, theme: theme.id })}
                        className={`min-h-[52px] px-4 py-3 rounded-2xl border text-left flex items-center justify-between transition-all ${
                          active
                            ? 'border-slate-900 bg-slate-50'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="w-6 h-6 rounded-full border border-black/10 shrink-0"
                            style={{ backgroundColor: theme.swatch }}
                          />
                          <span className="text-sm font-semibold text-slate-900">
                            {theme.label}
                          </span>
                        </div>
                        {active && <Check className="w-4 h-4 text-slate-900 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Time Format</div>
                  <div className="text-xs text-slate-500">Applies to clock & schedule</div>
                </div>
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                  {(['12h', '24h'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => onSaveSettings({ ...settings, timeFormat: fmt })}
                      className={`min-h-[40px] px-4 rounded-lg text-xs font-bold transition-colors ${
                        settings.timeFormat === fmt
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Sweep Second Hand
                  </div>
                  <div className="text-xs text-slate-500">
                    White sweeping second hand on analog dial
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.showSecondsHand}
                  onClick={() =>
                    onSaveSettings({
                      ...settings,
                      showSecondsHand: !settings.showSecondsHand,
                    })
                  }
                  className={`min-w-[56px] min-h-[34px] px-1 rounded-full transition-colors flex items-center ${
                    settings.showSecondsHand
                      ? 'bg-emerald-600 justify-end'
                      : 'bg-slate-300 justify-start'
                  }`}
                >
                  <span className="w-6 h-6 rounded-full bg-white shadow" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-6 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
