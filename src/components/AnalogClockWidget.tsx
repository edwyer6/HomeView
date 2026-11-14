import { useEffect, useState } from 'react';

interface AnalogClockWidgetProps {
  timeFormat: '12h' | '24h';
  showSecondsHand: boolean;
}

const HOUR_NUMBERS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export function AnalogClockWidget({ timeFormat, showSecondsHand }: AnalogClockWidgetProps) {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    let rafId = 0;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (showSecondsHand && !prefersReduced) {
      const tick = () => {
        setNow(new Date());
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    } else {
      intervalId = setInterval(() => setNow(new Date()), 1000);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [showSecondsHand]);

  const ms = now.getMilliseconds();
  const seconds = now.getSeconds() + (showSecondsHand ? ms / 1000 : 0);
  const minutes = now.getMinutes() + seconds / 60;
  const hours = (now.getHours() % 12) + minutes / 60;

  const secondAngle = seconds * 6;
  const minuteAngle = minutes * 6;
  const hourAngle = hours * 30;

  const formattedDigital = now.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: timeFormat === '12h',
  });

  const timezoneAbbr =
    Intl.DateTimeFormat([], { timeZoneName: 'short' })
      .formatToParts(now)
      .find((p) => p.type === 'timeZoneName')?.value || '';

  return (
    <section
      aria-label="Analog Clock"
      className="homeview-widget flex flex-col justify-between h-full min-h-[220px] md:min-h-0"
    >
      <div className="flex items-center justify-between shrink-0">
        <span
          className="font-semibold tracking-tight"
          style={{
            color: 'var(--ink-inverse)',
            fontSize: 'clamp(14px, 1.9vmin, 28px)',
          }}
        >
          Clock
        </span>
        <span
          className="font-medium font-mono-tabular"
          style={{
            color: 'var(--ink-secondary)',
            fontSize: 'clamp(12px, 1.5vmin, 22px)',
          }}
        >
          {formattedDigital}
          {timezoneAbbr ? ` · ${timezoneAbbr}` : ''}
        </span>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center pt-2">
        <svg
          viewBox="0 0 220 220"
          className="w-full h-full max-w-full max-h-full select-none"
          role="img"
          aria-label={`Current time ${formattedDigital}`}
        >
          {/* 60 minute / hour tick marks */}
          {Array.from({ length: 60 }).map((_, i) => {
            const isHour = i % 5 === 0;
            const angle = (i * 6 * Math.PI) / 180;
            const outerR = 100;
            const innerR = isHour ? 90 : 94.5;
            const x1 = 110 + Math.sin(angle) * innerR;
            const y1 = 110 - Math.cos(angle) * innerR;
            const x2 = 110 + Math.sin(angle) * outerR;
            const y2 = 110 - Math.cos(angle) * outerR;

            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={isHour ? 'var(--clock-tick-major)' : 'var(--clock-tick)'}
                strokeWidth={isHour ? 2.1 : 1.1}
                strokeLinecap="round"
              />
            );
          })}

          {/* 1 - 12 numerals */}
          {HOUR_NUMBERS.map((num, idx) => {
            const angle = (idx * 30 * Math.PI) / 180;
            const r = 74;
            const x = 110 + Math.sin(angle) * r;
            const y = 110 - Math.cos(angle) * r;

            return (
              <text
                key={num}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--ink-primary)"
                fontSize="16"
                fontWeight="600"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                {num}
              </text>
            );
          })}

          {/* Hour hand */}
          <g transform={`rotate(${hourAngle} 110 110)`}>
            <line
              x1={110}
              y1={114}
              x2={110}
              y2={62}
              stroke="var(--ink-primary)"
              strokeWidth={5.2}
              strokeLinecap="round"
            />
          </g>

          {/* Minute hand */}
          <g transform={`rotate(${minuteAngle} 110 110)`}>
            <line
              x1={110}
              y1={116}
              x2={110}
              y2={35}
              stroke="var(--ink-primary)"
              strokeWidth={3.6}
              strokeLinecap="round"
            />
          </g>

          {/* White sweep second hand */}
          {showSecondsHand && (
            <g transform={`rotate(${secondAngle} 110 110)`}>
              <line
                x1={110}
                y1={126}
                x2={110}
                y2={25}
                stroke="var(--clock-second)"
                strokeWidth={1.7}
                strokeLinecap="round"
              />
              <circle cx={110} cy={110} r={4.2} fill="var(--clock-second)" />
              <circle cx={110} cy={110} r={1.8} fill="var(--ink-primary)" />
            </g>
          )}

          {!showSecondsHand && (
            <circle cx={110} cy={110} r={4.2} fill="var(--ink-primary)" />
          )}
        </svg>
      </div>
    </section>
  );
}
