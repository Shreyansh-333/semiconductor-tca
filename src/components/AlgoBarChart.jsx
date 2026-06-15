// Dependency-free SVG bar chart comparing the four algos on the same order.
// Plots implementation shortfall (bps) with a zero baseline, since the metric
// can be a cost (positive, red) or price improvement (negative, green).
export default function AlgoBarChart({ rows, activeAlgo }) {
  const W = 560;
  const H = 220;
  const padL = 44;
  const padR = 14;
  const padT = 16;
  const padB = 30;

  if (!rows || rows.length === 0) return null;

  const values = rows.map((r) => r.implementationShortfallBps);
  const maxAbs = Math.max(1, ...values.map((v) => Math.abs(v)));

  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const slot = plotW / rows.length;
  const barW = slot * 0.5;

  // Map a bps value to a y pixel; +maxAbs at top, -maxAbs at bottom, 0 centered.
  const y = (v) => padT + (1 - (v + maxAbs) / (2 * maxAbs)) * plotH;
  const zeroY = y(0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Algo comparison bar chart">
      {/* zero baseline */}
      <line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY} stroke="var(--border)" strokeWidth="1" />
      <text x={padL - 6} y={zeroY} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="var(--muted)">
        0
      </text>

      {rows.map((r, i) => {
        const v = r.implementationShortfallBps;
        const cx = padL + slot * i + slot / 2;
        const top = Math.min(zeroY, y(v));
        const h = Math.abs(y(v) - zeroY);
        const isCost = v > 0;
        const isActive = r.algo === activeAlgo;
        return (
          <g key={r.algo}>
            <rect
              x={cx - barW / 2}
              y={top}
              width={barW}
              height={Math.max(h, 0.5)}
              fill={isCost ? 'var(--bad)' : 'var(--good)'}
              opacity={isActive ? 1 : 0.55}
              stroke={isActive ? 'var(--text-h)' : 'none'}
              strokeWidth={isActive ? 1.5 : 0}
              rx="2"
            />
            <text
              x={cx}
              y={v >= 0 ? top - 4 : top + h + 11}
              textAnchor="middle"
              fontSize="10"
              fill="var(--text)"
            >
              {v >= 0 ? '+' : ''}
              {v.toFixed(1)}
            </text>
            <text x={cx} y={H - 10} textAnchor="middle" fontSize="11" fill="var(--muted)">
              {r.algo}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
