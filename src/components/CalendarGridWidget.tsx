import { useMemo } from 'react';
import type { CalendarSyncPayload } from '../types/homeview';

interface CalendarGridWidgetProps {
  calendar: CalendarSyncPayload | null;
  selectedDateKey: string;
  onSelectDate: (dateKey: string) => void;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function CalendarGridWidget({
  calendar,
  selectedDateKey,
  onSelectDate,
}: CalendarGridWidgetProps) {
  const now = new Date();
  const todayKey = formatDateKey(now);

  const weekdayShort = now.toLocaleDateString([], { weekday: 'short' });
  const monthShort = now.toLocaleDateString([], { month: 'short' });
  const monthLong = now.toLocaleDateString([], { month: 'long' }).toUpperCase();
  const dayNumber = now.getDate();

  const { cells, weekCount } = useMemo(() => {
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const list: Array<{ day: number | null; dateKey: string | null }> = [];
    for (let i = 0; i < firstDay; i++) {
      list.push({ day: null, dateKey: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const cellDate = new Date(year, month, d);
      list.push({ day: d, dateKey: formatDateKey(cellDate) });
    }
    const rows = Math.ceil(list.length / 7);
    return { cells: list, weekCount: rows };
  }, [now.getFullYear(), now.getMonth()]);

  const eventDateSet = useMemo(() => {
    return new Set(calendar?.eventDates || []);
  }, [calendar?.eventDates]);

  return (
    <section
      aria-label="Date and Month Calendar"
      className="homeview-widget flex flex-col justify-between h-full min-h-[220px] md:min-h-0"
    >
      {/* Compact Date Hero */}
      <div className="flex items-end justify-between gap-3 shrink-0">
        <div className="flex items-baseline gap-[clamp(8px,1.2vmin,18px)]">
          <div
            className="font-bold leading-none tracking-tighter tabular-nums"
            style={{
              color: 'var(--ink-primary)',
              fontSize: 'clamp(2.25rem, 5.5vmin, 5.75rem)',
            }}
          >
            {dayNumber}
          </div>
          <div
            className="font-semibold tracking-tight leading-none"
            style={{
              color: 'var(--ink-inverse)',
              fontSize: 'clamp(15px, 2.2vmin, 34px)',
            }}
          >
            {weekdayShort} {monthShort}
          </div>
        </div>

        <div
          className="font-bold tracking-wider pb-0.5 shrink-0"
          style={{
            color: 'var(--ink-primary)',
            fontSize: 'clamp(11px, 1.45vmin, 22px)',
          }}
        >
          {monthLong}
        </div>
      </div>

      {/* Month Grid sized to fill remaining height without ever overflowing */}
      <div className="flex-1 min-h-0 flex flex-col mt-[clamp(8px,1.2vmin,18px)]">
        <div className="grid grid-cols-7 text-center shrink-0 mb-1">
          {WEEKDAYS.map((wd, idx) => (
            <span
              key={idx}
              className="font-semibold leading-none py-0.5"
              style={{
                color: 'var(--ink-secondary)',
                fontSize: 'clamp(10px, 1.35vmin, 20px)',
              }}
            >
              {wd}
            </span>
          ))}
        </div>

        <div
          className="flex-1 min-h-0 grid grid-cols-7 gap-y-0.5 text-center"
          style={{ gridTemplateRows: `repeat(${weekCount}, minmax(0, 1fr))` }}
        >
          {cells.map((cell, idx) => {
            if (!cell.day || !cell.dateKey) {
              return <span key={idx} className="h-full" />;
            }
            const isToday = cell.dateKey === todayKey;
            const isSelected = cell.dateKey === selectedDateKey;
            const hasEvents = eventDateSet.has(cell.dateKey);

            return (
              <button
                key={cell.dateKey}
                type="button"
                onClick={() => onSelectDate(cell.dateKey!)}
                className="relative h-full w-full flex items-center justify-center focus-visible:outline-2 focus-visible:outline-white"
              >
                <span
                  className="relative flex items-center justify-center rounded-full tabular-nums transition-transform active:scale-95"
                  style={{
                    width: 'clamp(24px, 3.4vmin, 52px)',
                    height: 'clamp(24px, 3.4vmin, 52px)',
                    fontSize: 'clamp(11px, 1.55vmin, 24px)',
                    backgroundColor: isToday
                      ? 'var(--accent-pill-bg)'
                      : isSelected
                        ? 'rgba(255,255,255,0.35)'
                        : 'transparent',
                    color: isToday ? 'var(--accent-pill-ink)' : 'var(--ink-primary)',
                    fontWeight: isToday || isSelected ? 700 : 500,
                  }}
                >
                  {cell.day}
                  {hasEvents && !isToday && (
                    <span
                      className="absolute bottom-0.5 rounded-full"
                      style={{
                        width: 'clamp(3px, 0.45vmin, 6px)',
                        height: 'clamp(3px, 0.45vmin, 6px)',
                        backgroundColor: 'var(--ink-primary)',
                      }}
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
