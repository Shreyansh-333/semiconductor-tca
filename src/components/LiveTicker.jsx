import { useEffect, useState } from 'react';
import { fetchQuote } from '../api/twelveData';

// How often to refresh the live quote. Kept modest to respect the free-tier
// rate limit (8 req/min, 800/day) and paused while the tab is hidden.
const POLL_MS = 15000;

export default function LiveTicker({ symbol }) {
  const [quote, setQuote] = useState(null);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0); // bump to replay the flash animation

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const q = await fetchQuote(symbol);
        if (!active) return;
        setQuote(q);
        setErr('');
        setTick((t) => t + 1);
      } catch (e) {
        if (active) setErr(e.message);
      }
    }

    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, POLL_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [symbol]);

  if (err) {
    return (
      <div className="ticker ticker-err">
        {symbol} · {err}
      </div>
    );
  }
  if (!quote) {
    return <div className="ticker ticker-loading">Loading {symbol}…</div>;
  }

  const up = quote.percentChange >= 0;
  return (
    // key={tick} remounts the node so the CSS flash re-runs on every refresh.
    <div key={tick} className={`ticker ${up ? 'up' : 'down'}`}>
      <span className="t-sym">{quote.symbol}</span>
      <span className="t-price">${quote.price.toFixed(2)}</span>
      <span className="t-chg">
        {up ? '▲' : '▼'} {Math.abs(quote.change).toFixed(2)} ({quote.percentChange.toFixed(2)}%)
      </span>
      <span className="t-state">{quote.isMarketOpen ? 'live' : 'last close'}</span>
    </div>
  );
}
