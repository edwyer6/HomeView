import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Navigation,
  Sun,
} from 'lucide-react';
import type { WeatherData } from '../types/homeview';

interface WeatherWidgetProps {
  weather: WeatherData | null;
  loading: boolean;
  error: string | null;
  onOpenLocationSettings: () => void;
}

function WeatherConditionIcon({
  code,
  isDay,
  className,
}: {
  code: number;
  isDay: boolean;
  className?: string;
}) {
  if (code === 0) {
    return isDay ? <Sun className={className} /> : <Moon className={className} />;
  }
  if (code === 1 || code === 2) {
    return isDay ? <CloudSun className={className} /> : <Cloud className={className} />;
  }
  if (code === 3) return <Cloud className={className} />;
  if (code === 45 || code === 48) return <CloudFog className={className} />;
  if (code >= 51 && code <= 57) return <CloudDrizzle className={className} />;
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    return <CloudRain className={className} />;
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return <CloudSnow className={className} />;
  }
  if (code >= 95) return <CloudLightning className={className} />;
  return <Cloud className={className} />;
}

export function WeatherWidget({
  weather,
  loading,
  error,
  onOpenLocationSettings,
}: WeatherWidgetProps) {
  return (
    <section
      aria-label="Weather"
      className="homeview-widget flex flex-col justify-between h-full min-h-[220px] md:min-h-0"
    >
      {/* Top city selector matching reference image white city + nav arrow */}
      <div className="flex items-center justify-between gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenLocationSettings}
          className="inline-flex items-center gap-1.5 min-h-[40px] -my-2 px-1 rounded-xl text-left transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-white"
          title="Change weather city"
        >
          <span
            className="font-semibold tracking-tight truncate max-w-[280px]"
            style={{
              color: 'var(--ink-inverse)',
              fontSize: 'clamp(16px, 2.25vmin, 34px)',
            }}
          >
            {weather?.city || 'Loading'}
          </span>
          <Navigation
            className="shrink-0 fill-current"
            style={{
              color: 'var(--ink-inverse)',
              width: 'clamp(15px, 1.9vmin, 28px)',
              height: 'clamp(15px, 1.9vmin, 28px)',
            }}
          />
        </button>

        {weather && (
          <span
            className="font-medium tabular-nums whitespace-nowrap"
            style={{
              color: 'var(--ink-secondary)',
              fontSize: 'clamp(12px, 1.5vmin, 22px)',
            }}
          >
            Feels {weather.feelsLike}°
          </span>
        )}
      </div>

      {/* Main Temperature & Condition */}
      {loading && !weather ? (
        <div className="flex-1 flex flex-col justify-center gap-3 py-2">
          <div className="h-14 w-32 rounded-2xl bg-black/10 animate-pulse" />
          <div className="h-5 w-24 rounded-lg bg-black/10 animate-pulse" />
        </div>
      ) : error && !weather ? (
        <div className="flex-1 flex flex-col justify-center gap-2 py-2">
          <p className="text-sm font-medium" style={{ color: 'var(--ink-primary)' }}>
            Unable to load weather
          </p>
          <button
            type="button"
            onClick={onOpenLocationSettings}
            className="self-start px-3 py-2 text-xs font-semibold rounded-xl min-h-[40px]"
            style={{
              backgroundColor: 'var(--accent-pill-bg)',
              color: 'var(--accent-pill-ink)',
            }}
          >
            Choose City
          </button>
        </div>
      ) : weather ? (
        <div className="flex-1 min-h-0 flex flex-col justify-center">
          <div
            className="leading-none font-semibold tracking-tighter tabular-nums"
            style={{
              color: 'var(--ink-primary)',
              fontSize: 'clamp(3.5rem, 9.5vmin, 9.5rem)',
            }}
          >
            {weather.temp}°
          </div>

          <div className="mt-[clamp(6px,1.1vmin,16px)] flex items-center gap-[clamp(8px,1vmin,14px)]">
            <WeatherConditionIcon
              code={weather.weatherCode}
              isDay={weather.isDay}
              className="shrink-0 w-[clamp(18px,2.5vmin,36px)] h-[clamp(18px,2.5vmin,36px)]"
            />
            <span
              className="font-semibold tracking-tight"
              style={{
                color: 'var(--ink-primary)',
                fontSize: 'clamp(15px, 2.1vmin, 32px)',
              }}
            >
              {weather.condition}
            </span>
          </div>

          <div
            className="mt-1 flex items-center gap-[clamp(10px,1.4vmin,20px)] font-semibold tabular-nums"
            style={{
              color: 'var(--ink-primary)',
              fontSize: 'clamp(13px, 1.85vmin, 27px)',
            }}
          >
            <span>H:{weather.high}°</span>
            <span>L:{weather.low}°</span>
            <span className="font-medium" style={{ color: 'var(--ink-secondary)' }}>
              · {weather.humidity}% RH
            </span>
          </div>
        </div>
      ) : null}

      {/* Minimal Hourly Strip */}
      {weather && weather.hourly.length > 0 && (
        <div
          className="pt-[clamp(8px,1.3vmin,20px)] mt-2 grid grid-cols-4 gap-2 shrink-0"
          style={{ borderTop: '1px solid var(--hairline)' }}
        >
          {weather.hourly.slice(0, 4).map((slot) => {
            const hourLabel = new Date(slot.time).toLocaleTimeString([], {
              hour: 'numeric',
            });
            return (
              <div key={slot.time} className="flex flex-col items-start">
                <span
                  className="font-medium whitespace-nowrap"
                  style={{
                    color: 'var(--ink-secondary)',
                    fontSize: 'clamp(11px, 1.4vmin, 20px)',
                  }}
                >
                  {hourLabel}
                </span>
                <div className="flex items-center gap-1 mt-0.5">
                  <WeatherConditionIcon
                    code={slot.weatherCode}
                    isDay={true}
                    className="shrink-0 w-[clamp(13px,1.7vmin,24px)] h-[clamp(13px,1.7vmin,24px)]"
                  />
                  <span
                    className="font-semibold tabular-nums"
                    style={{
                      color: 'var(--ink-primary)',
                      fontSize: 'clamp(13px, 1.85vmin, 27px)',
                    }}
                  >
                    {slot.temp}°
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
