import { typicalPrice } from '../lib/execution';

// SVG line chart of typical price across the window, with:
//  - horizontal reference lines (arrival / VWAP / avg exec)
//  - child fills drawn as dots, revealed progressively via `landedCount`
export default function PriceChart({ bars, lines = [], fills = [], landedCount = 0 }) {
  const W = 860;
  const H = 300;
  const padL = 58;
  const padR = 16;
  const padT = 14;
  const padB = 28;

  if (bars.length < 2) return null;

  const prices = bars.map(typicalPrice);
  const fillPrices = fills.slice(0, landedCount).map((f) => f.price);
  const values = prices.concat(lines.map((l) => l.value)).concat(fillPrices);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const x = (i) => padL + (i / (bars.length - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - min) / range) * (H - padT - padB);

  // Map each bar's datetime to its index so a fill can be placed on the x-axis.
  const indexByTime = new Map(bars.map((b, i) => [b.datetime, i]));

  const path = prices
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p).toFixed(1)}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Intraday price chart with fills">
      {/* y-axis min/max labels */}
      <text x={padL - 8} y={y(max)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="var(--muted)">
        {max.toFixed(2)}
      </text>
      <text x={padL - 8} y={y(min)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="var(--muted)">
        {min.toFixed(2)}
      </text>

      {/* reference lines */}
      {lines.map((l) => (
        <g key={l.label}>
          <line
            x1={padL}
            x2={W - padR}
            y1={y(l.value)}
            y2={y(l.value)}
            stroke={l.color}
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.8"
          />
          <text x={W - padR} y={y(l.value) - 4} textAnchor="end" fontSize="10" fill={l.color}>
            {l.label} {l.value.toFixed(2)}
          </text>
        </g>
      ))}

      {/* price line */}
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="1.75" />

      {/* child fills, revealed one at a time */}
      {fills.slice(0, landedCount).map((f, i) => {
        const idx = indexByTime.get(f.datetime) ?? 0;
        const isLatest = i === landedCount - 1;
        return (
          <circle
            key={f.datetime}
            cx={x(idx)}
            cy={y(f.price)}
            r={isLatest ? 5 : 3}
            fill="var(--accent)"
            opacity={isLatest ? 1 : 0.6}
            className={isLatest ? 'fill-dot-latest' : 'fill-dot'}
          />
        );
      })}

      {/* x-axis endpoints */}
      <text x={padL} y={H - 8} textAnchor="start" fontSize="10" fill="var(--muted)">
        {bars[0].datetime}
      </text>
      <text x={W - padR} y={H - 8} textAnchor="end" fontSize="10" fill="var(--muted)">
        {bars[bars.length - 1].datetime}
      </text>
    </svg>
  );
}
