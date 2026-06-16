import { useEffect, useRef, useState } from 'react';
import { fetchIntraday } from './api/twelveData';
import { simulateExecution } from './lib/execution';
import { computeMetrics, analyzeAllAlgos } from './lib/metrics';
import LiveTicker from './components/LiveTicker';
import PriceChart from './components/PriceChart';
import AlgoBarChart from './components/AlgoBarChart';
import EmptyState from './components/EmptyState';
import './App.css';

// Semiconductor basket. Edit this list to change the universe.
// Note: Infineon (IFX/XETRA) is not on Twelve Data's free tier, so NXP — the
// closest free-tier auto/industrial-semiconductor peer — is the default.
const BASKET = ['NXPI', 'NVDA', 'AMD', 'INTC', 'AVGO', 'QCOM', 'TXN', 'MU', 'TSM', 'ON'];
const DEFAULT_SYMBOL = 'NXPI';

// Roughly how long the fills take to "land" across the chart.
const RUN_DURATION_MS = 40000;

const fmtPrice = (v) =>
  v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsd = (v) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtBps = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} bps`;
const fmtPct = (v) => `${(v * 100).toFixed(1)}%`;

// Positive = worse execution → red; negative = price improvement → green.
const tone = (v) => (v > 0.05 ? 'bad' : v < -0.05 ? 'good' : '');

export default function App() {
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [side, setSide] = useState('buy');
  const [quantity, setQuantity] = useState(10000);
  const [algo, setAlgo] = useState('TWAP');
  const [povPercent, setPovPercent] = useState(10);

  const [bars, setBars] = useState([]);
  const [meta, setMeta] = useState(null);
  const [fills, setFills] = useState([]);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [rollup, setRollup] = useState(null);
  const [landedCount, setLandedCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const recordedFills = useRef(null); // guards against double-recording a run

  async function handleRun(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setFills([]);
    setRollup(null);
    setLandedCount(0);
    setRunning(false);
    try {
      const result = await fetchIntraday(symbol, '1min', 100);
      if (result.bars.length < 2) {
        throw new Error('Not enough bars returned to analyze. Try another symbol.');
      }
      const order = { side, quantity: Number(quantity), algo, povRate: Number(povPercent) / 100 };
      const childFills = simulateExecution(result.bars, order);

      setBars(result.bars);
      setMeta(result.meta);
      setCurrentOrder(order);
      setRollup(analyzeAllAlgos(result.bars, order));
      setFills(childFills);
      setLandedCount(0);
      setRunning(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Reveal the fills one at a time over ~RUN_DURATION_MS.
  useEffect(() => {
    if (!running || fills.length === 0) return;
    const total = fills.length;
    const step = Math.min(1500, Math.max(120, RUN_DURATION_MS / total));
    const id = setInterval(() => {
      setLandedCount((c) => {
        const next = c + 1;
        if (next >= total) {
          clearInterval(id);
          return total;
        }
        return next;
      });
    }, step);
    return () => clearInterval(id);
  }, [running, fills]);

  // When all fills have landed, record the completed order exactly once.
  useEffect(() => {
    if (running && fills.length > 0 && landedCount >= fills.length && recordedFills.current !== fills) {
      recordedFills.current = fills;
      const m = computeMetrics(bars, fills, currentOrder);
      setCompleted((prev) => [
        { id: Date.now(), time: new Date(), symbol, order: currentOrder, metrics: m },
        ...prev,
      ]);
      setRunning(false);
    }
  }, [landedCount, running, fills, bars, currentOrder, symbol]);

  // Live metrics from the fills that have landed so far (drives the KPI cards).
  const landedFills = fills.slice(0, landedCount);
  const live = fills.length > 0 ? computeMetrics(bars, landedFills, currentOrder) : null;

  const chartLines = live
    ? [
        { label: 'Arrival', value: live.arrivalPrice, color: 'var(--muted)' },
        { label: 'VWAP', value: live.intervalVwap, color: 'var(--good)' },
        ...(landedCount > 0 ? [{ label: 'Avg Exec', value: live.avgExecPrice, color: 'var(--accent)' }] : []),
      ]
    : [];

  return (
    <div className="app">
      <header className="app-header">
        <span className="logo">Semiconductor Execution Analytics</span>
        <nav className="header-links">
          <a href="https://github.com/Shreyansh-333" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href="#about">About</a>
        </nav>
      </header>

      <section className="intro">
        <div className="intro-text">
          <h1>Execution cost analytics for semiconductor stocks</h1>
          <p>
            This tool runs transaction cost analysis on real intraday market data for
            semiconductor names. It simulates how different execution algorithms would have
            performed against today's actual price and volume, then scores each one on cost and
            slippage so you can compare which approach traded better.
          </p>
        </div>
        <LiveTicker symbol={symbol} />
      </section>

      <div className="source-row">
        <span className="source">Market data: Twelve Data (real intraday &amp; quotes)</span>
        <span className="badge-sim">Executions simulated</span>
      </div>

      <div className="basket">
        {BASKET.map((s) => (
          <button
            key={s}
            type="button"
            className={`chip ${s === symbol ? 'active' : ''}`}
            onClick={() => setSymbol(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <form onSubmit={handleRun} className="controls">
        <label>
          Side
          <select value={side} onChange={(e) => setSide(e.target.value)}>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
        </label>
        <label>
          Quantity
          <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </label>
        <label>
          Algo
          <select value={algo} onChange={(e) => setAlgo(e.target.value)}>
            <option value="TWAP">TWAP (time-weighted)</option>
            <option value="VWAP">VWAP (volume-weighted)</option>
            <option value="POV">POV (percent of volume)</option>
            <option value="IS">IS (implementation shortfall)</option>
          </select>
        </label>
        {algo === 'POV' && (
          <label>
            POV %
            <input type="number" min="1" max="100" value={povPercent} onChange={(e) => setPovPercent(e.target.value)} />
          </label>
        )}
        <button type="submit" disabled={loading || running}>
          {loading ? 'Loading…' : running ? 'Running…' : 'Run execution'}
        </button>
      </form>

      {error && <p className="error">⚠️ {error}</p>}

      {meta && (
        <p className="meta">
          {symbol} · {meta.exchange} · {bars.length} bars · {side.toUpperCase()}{' '}
          {Number(quantity).toLocaleString()} · {algo}
          {algo === 'POV' ? ` @ ${povPercent}%` : ''}
          {fills.length > 0 && (
            <span className="run-state">
              {' · '}
              {running ? `filling ${landedCount}/${fills.length}…` : `done (${fills.length} fills)`}
            </span>
          )}
        </p>
      )}

      {!live && !loading && <EmptyState />}

      {live && (
        <div className="kpis">
          <Kpi label="Impl. Shortfall" value={fmtBps(live.implementationShortfallBps)} tone={tone(live.implementationShortfallBps)} />
          <Kpi label="Slippage vs VWAP" value={fmtBps(live.vwapSlippageBps)} tone={tone(live.vwapSlippageBps)} />
          <Kpi label="Fill Rate" value={fmtPct(live.fillRate)} />
          <Kpi label="Total Cost" value={fmtUsd(live.totalCost)} tone={tone(live.totalCost)} />
        </div>
      )}

      {bars.length > 0 && live && (
        <div className="chart-card">
          <h3>Price path and fills for {symbol}</h3>
          <PriceChart bars={bars} lines={chartLines} fills={fills} landedCount={landedCount} />
        </div>
      )}

      {rollup && (
        <div className="chart-card">
          <h3>Implementation shortfall by algo, in bps, on the same order</h3>
          <AlgoBarChart rows={rollup} activeAlgo={currentOrder?.algo} />
        </div>
      )}

      {completed.length > 0 && (
        <div className="table-card">
          <h3>Completed orders</h3>
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Symbol</th>
                <th>Side</th>
                <th>Qty</th>
                <th>Algo</th>
                <th>IS (bps)</th>
                <th>VWAP slip</th>
                <th>Fill</th>
                <th>Total cost</th>
              </tr>
            </thead>
            <tbody>
              {completed.map((c) => (
                <tr key={c.id}>
                  <td>{c.time.toLocaleTimeString()}</td>
                  <td>{c.symbol}</td>
                  <td>{c.order.side.toUpperCase()}</td>
                  <td>{c.order.quantity.toLocaleString()}</td>
                  <td>{c.order.algo}</td>
                  <td className={tone(c.metrics.implementationShortfallBps)}>
                    {fmtBps(c.metrics.implementationShortfallBps)}
                  </td>
                  <td className={tone(c.metrics.vwapSlippageBps)}>{fmtBps(c.metrics.vwapSlippageBps)}</td>
                  <td>{fmtPct(c.metrics.fillRate)}</td>
                  <td className={tone(c.metrics.totalCost)}>{fmtUsd(c.metrics.totalCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer id="about" className="foot">
        <p className="foot-by">
          Built by Shreyansh Agrawal
          <span className="dot">·</span>
          <a href="https://github.com/Shreyansh-333" target="_blank" rel="noreferrer">GitHub</a>
          <span className="dot">·</span>
          <a
            href="https://www.linkedin.com/in/shreyanshagrawal333/"
            target="_blank"
            rel="noreferrer"
          >
            LinkedIn
          </a>
        </p>
        <p>
          I built this to explore execution analytics and to bring my dashboard work into a new
          domain.
        </p>
        <p>Market data provided by Twelve Data.</p>
        <p className="foot-disclaimer">
          All executions, fills, spread and impact costs are simulated for analysis only. There is
          no live trading, and market data may be delayed.
        </p>
      </footer>
    </div>
  );
}

function Kpi({ label, value, tone = '' }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className={`value ${tone}`}>{value}</div>
    </div>
  );
}
