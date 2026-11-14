import { useMemo } from 'react';
import { Calendar as CalendarIcon, RefreshCw } from 'lucide-react';
import type { CalendarEventItem, CalendarSyncPayload } from '../types/homeview';
import { formatDateKey } from './CalendarGridWidget';

interface CalendarScheduleWidgetProps {
  calendar: CalendarSyncPayload | null;
  hasCalendarUrl: boolean;
  syncing: boolean;
  selectedDateKey: string;
  timeFormat: '12h' | '24h';
  onResetToToday: () => void;
  onOpenCalendarSettings: () => void;
  onManualSync: () => void;
}

function formatEventTime(ev: CalendarEventItem, timeFormat: '12h' | '24h'): string {
  if (ev.isAllDay) return 'All Day';
  const d = new Date(ev.start);
  return d.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: timeFormat === '12h',
  });
}

function formatEventDayPrefix(isoDate: string, todayKey: string): string {
  const d = new Date(isoDate);
  const key = formatDateKey(d);
  if (key === todayKey) return 'Today';
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (key === formatDateKey(tomorrow)) return 'Tomorrow';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export function CalendarScheduleWidget({
  calendar,
  hasCalendarUrl,
  syncing,
  selectedDateKey,
  timeFormat,
  onResetToToday,
  onOpenCalendarSettings,
  onManualSync,
}: CalendarScheduleWidgetProps) {
  const todayKey = formatDateKey(new Date());
  const isViewingToday = selectedDateKey === todayKey;

  const displayedEvents = useMemo(() => {
    if (!calendar) return [];
    if (!isViewingToday) {
      return calendar.events.filter((ev) => formatDateKey(new Date(ev.start)) === selectedDateKey);
    }
    const today = calendar.todayEvents || [];
    if (today.length >= 4) return today.slice(0, 6);
    const needed = 4 - today.length;
    const upcoming = (calendar.upcomingEvents || []).slice(0, needed);
    return [...today, ...upcoming];
  }, [calendar, selectedDateKey, isViewingToday]);

  const headerTitle = isViewingToday
    ? 'Apple Calendar'
    : new Date(`${selectedDateKey}T12:00:00`).toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });

  return (
    <section
      aria-label="Apple Calendar Live Schedule"
      className="homeview-widget flex flex-col justify-between h-full min-h-[220px] md:min-h-0"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 shrink-0 pb-[clamp(8px,1.2vmin,18px)]">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="font-bold tracking-tight truncate"
            style={{
              color: 'var(--ink-inverse)',
              fontSize: 'clamp(16px, 2.2vmin, 34px)',
            }}
          >
            {headerTitle}
          </span>
          {!isViewingToday && (
            <button
              type="button"
              onClick={onResetToToday}
              className="font-semibold underline underline-offset-2 min-h-[32px] px-1 shrink-0"
              style={{
                color: 'var(--ink-primary)',
                fontSize: 'clamp(12px, 1.5vmin, 22px)',
              }}
            >
              Back to Today
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {hasCalendarUrl && (
            <button
              type="button"
              onClick={onManualSync}
              aria-label="Sync Apple Calendar now"
              title="Sync Apple Calendar now"
              className="min-w-[40px] min-h-[40px] -my-2 flex items-center justify-center rounded-xl transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-white"
              style={{ color: 'var(--ink-secondary)' }}
            >
              <RefreshCw
                className={`w-[clamp(15px,1.8vmin,26px)] h-[clamp(15px,1.8vmin,26px)] ${
                  syncing ? 'animate-spin' : ''
                }`}
              />
            </button>
          )}
          <button
            type="button"
            onClick={onOpenCalendarSettings}
            className="min-h-[40px] -my-2 px-2.5 rounded-xl font-semibold hover:underline whitespace-nowrap"
            style={{
              color: 'var(--ink-secondary)',
              fontSize: 'clamp(12px, 1.5vmin, 22px)',
            }}
          >
            {hasCalendarUrl ? 'Manage' : 'Setup'}
          </button>
        </div>
      </div>

      {/* Scrollable/Contained Event Body */}
      <div className="flex-1 min-h-0 flex flex-col justify-center overflow-hidden">
        {!hasCalendarUrl ? (
          <div className="flex flex-col justify-center items-start gap-[clamp(10px,1.4vmin,20px)] py-1">
            <p
              className="leading-relaxed max-w-2xl"
              style={{
                color: 'var(--ink-secondary)',
                fontSize: 'clamp(13px, 1.75vmin, 25px)',
              }}
            >
              Connect your Apple iCloud Calendar via its public{' '}
              <code className="font-mono">webcal://</code> link to stream real-time
              events directly onto this display.
            </p>
            <button
              type="button"
              onClick={onOpenCalendarSettings}
              className="inline-flex items-center gap-2 px-[clamp(14px,1.8vmin,28px)] py-[clamp(10px,1.2vmin,18px)] rounded-2xl font-semibold min-h-[44px] transition-transform active:scale-[0.98]"
              style={{
                backgroundColor: 'var(--accent-pill-bg)',
                color: 'var(--accent-pill-ink)',
                fontSize: 'clamp(12px, 1.55vmin, 22px)',
              }}
            >
              <CalendarIcon className="w-[clamp(15px,1.8vmin,24px)] h-[clamp(15px,1.8vmin,24px)] shrink-0" />
              <span>Connect Apple Calendar</span>
            </button>
          </div>
        ) : calendar?.error && displayedEvents.length === 0 ? (
          <div className="flex flex-col justify-center items-start gap-2 py-1">
            <p
              className="font-semibold"
              style={{
                color: 'var(--ink-primary)',
                fontSize: 'clamp(14px, 1.85vmin, 26px)',
              }}
            >
              Calendar sync issue
            </p>
            <p
              className="line-clamp-2"
              style={{
                color: 'var(--ink-secondary)',
                fontSize: 'clamp(12px, 1.5vmin, 21px)',
              }}
            >
              {calendar.error}
            </p>
            <button
              type="button"
              onClick={onOpenCalendarSettings}
              className="px-4 py-2 rounded-xl font-semibold min-h-[40px]"
              style={{
                backgroundColor: 'var(--accent-pill-bg)',
                color: 'var(--accent-pill-ink)',
                fontSize: 'clamp(12px, 1.5vmin, 21px)',
              }}
            >
              Check Calendar URL
            </button>
          </div>
        ) : displayedEvents.length === 0 ? (
          <div className="flex flex-col justify-center py-1">
            <p
              className="font-bold tracking-tight"
              style={{
                color: 'var(--ink-primary)',
                fontSize: 'clamp(16px, 2.3vmin, 34px)',
              }}
            >
              Clear schedule
            </p>
            <p
              className="mt-1"
              style={{
                color: 'var(--ink-secondary)',
                fontSize: 'clamp(12px, 1.65vmin, 24px)',
              }}
            >
              {isViewingToday
                ? 'No events scheduled for today or the next two weeks.'
                : 'No events scheduled on this day.'}
            </p>
          </div>
        ) : (
          <ul
            className="h-full overflow-y-auto pr-1 divide-y"
            style={{ borderColor: 'var(--hairline)' }}
          >
            {displayedEvents.map((ev) => {
              const dayLabel = formatEventDayPrefix(ev.start, todayKey);
              const showDay = isViewingToday && dayLabel !== 'Today';
              return (
                <li
                  key={ev.id}
                  className="py-[clamp(6px,0.95vmin,14px)] first:pt-0 last:pb-0 flex items-center justify-between gap-3 min-w-0"
                  style={{ borderColor: 'var(--hairline)' }}
                >
                  <div className="min-w-0 flex-1">
                    <div
                      className="font-semibold truncate"
                      style={{
                        color: 'var(--ink-primary)',
                        fontSize: 'clamp(13px, 1.85vmin, 27px)',
                      }}
                    >
                      {ev.title}
                    </div>
                    {ev.location && (
                      <div
                        className="truncate"
                        style={{
                          color: 'var(--ink-secondary)',
                          fontSize: 'clamp(11px, 1.4vmin, 21px)',
                        }}
                      >
                        {ev.location}
                      </div>
                    )}
                  </div>

                  <div
                    className="font-semibold tabular-nums whitespace-nowrap shrink-0 text-right"
                    style={{
                      color: 'var(--ink-secondary)',
                      fontSize: 'clamp(12px, 1.55vmin, 23px)',
                    }}
                  >
                    {showDay ? `${dayLabel} · ` : ''}
                    {formatEventTime(ev, timeFormat)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer */}
      {hasCalendarUrl && calendar?.syncedAt && (
        <div
          className="pt-[clamp(8px,1.1vmin,16px)] mt-1 shrink-0 flex items-center justify-between font-medium tabular-nums"
          style={{
            color: 'var(--ink-muted)',
            borderTop: '1px solid var(--hairline)',
            fontSize: 'clamp(11px, 1.35vmin, 20px)',
          }}
        >
          <span>Live iCloud Sync · {calendar.events.length} events</span>
          <span>
            Updated{' '}
            {new Date(calendar.syncedAt).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
              hour12: timeFormat === '12h',
            })}
          </span>
        </div>
      )}
    </section>
  );
}
