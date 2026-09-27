import { useState } from "react";

// Single-series column chart: thin columns from a shared baseline, hairline grid,
// a value label on the newest column, and a hover/focus tooltip per column.
// Colors are validated against the app's dark glass surface.
export default function ColumnChart({
  data, // [{ value, ...anything the tooltip needs }]
  max, // value at the top gridline
  ticks, // gridline values, e.g. [100, 50, 0]
  formatTick = (t) => t,
  capLabel, // (d) => label shown on the newest column
  renderTooltip, // (d) => JSX
  ariaLabel, // (d) => string for screen readers
  color = "#6366f1",
  hoverColor = "#818cf8",
}) {
  const [hovered, setHovered] = useState(null);
  const last = data.length - 1;
  const heightOf = (v) => Math.min((v / (max || 1)) * 100, 100);

  return (
    <div className="flex gap-2">
      {/* Y axis labels */}
      <div className="relative w-10 h-48 flex-shrink-0 text-xs text-white/40">
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute right-0 -translate-y-1/2"
            style={{ top: `${100 - heightOf(t)}%` }}
          >
            {formatTick(t)}
          </span>
        ))}
      </div>

      {/* Plot */}
      <div className="relative flex-1 h-48">
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute left-0 right-0 h-px bg-white/10"
            style={{ top: `${100 - heightOf(t)}%` }}
          />
        ))}

        <div className="absolute inset-0 flex items-end">
          {data.map((d, i) => {
            const h = heightOf(d.value);
            return (
              <button
                key={i}
                type="button"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(i)}
                onBlur={() => setHovered(null)}
                aria-label={ariaLabel ? ariaLabel(d) : String(d.value)}
                className="relative flex-1 h-full flex items-end justify-center outline-none focus-visible:bg-white/5"
              >
                <div
                  className="w-full mx-px rounded-t"
                  style={{
                    maxWidth: 24,
                    height: d.value > 0 ? `${h}%` : 2,
                    background: hovered === i ? hoverColor : color,
                    opacity: d.value > 0 ? 1 : 0.5,
                  }}
                />
                {capLabel && i === last && hovered === null && (
                  <span
                    className="absolute text-xs font-semibold text-white whitespace-nowrap"
                    style={{ bottom: `calc(${h}% + 4px)` }}
                  >
                    {capLabel(d)}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {hovered !== null && renderTooltip && (
          <div
            className="absolute z-10 -translate-x-1/2 pointer-events-none bg-gray-900/95 border border-white/20 rounded-lg px-3 py-2 text-xs text-white shadow-xl whitespace-nowrap"
            style={{
              left: `${Math.min(Math.max(((hovered + 0.5) / data.length) * 100, 12), 88)}%`,
              bottom: `calc(${heightOf(data[hovered].value)}% + 8px)`,
            }}
          >
            {renderTooltip(data[hovered])}
          </div>
        )}
      </div>
    </div>
  );
}
