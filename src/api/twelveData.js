// Thin client for the Twelve Data REST API.
// The key is read from the Vite env var VITE_TWELVE_DATA_KEY (see .env.local).
const API_KEY = import.meta.env.VITE_TWELVE_DATA_KEY;
const BASE_URL = 'https://api.twelvedata.com';

/**
 * Fetch intraday OHLCV bars for a symbol.
 * Twelve Data returns newest-first; we reverse to chronological (oldest-first)
 * and convert the string fields to numbers so the rest of the app can do math.
 *
 * @returns {Promise<{ meta: object, bars: Array }>}
 */
export async function fetchIntraday(symbol, interval = '1min', outputsize = 100) {
  if (!API_KEY) {
    throw new Error(
      'Missing API key. Add VITE_TWELVE_DATA_KEY to .env.local and restart the dev server.'
    );
  }

  const url =
    `${BASE_URL}/time_series` +
    `?symbol=${encodeURIComponent(symbol)}` +
    `&interval=${interval}` +
    `&outputsize=${outputsize}` +
    `&apikey=${API_KEY}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Network error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  // Twelve Data signals problems in the body with status: 'error'.
  if (data.status === 'error') {
    throw new Error(data.message || 'Twelve Data returned an error.');
  }

  const bars = (data.values || [])
    .map((v) => ({
      datetime: v.datetime,
      open: Number(v.open),
      high: Number(v.high),
      low: Number(v.low),
      close: Number(v.close),
      volume: Number(v.volume),
    }))
    .reverse();

  return { meta: data.meta, bars };
}

/**
 * Fetch a single real-time-ish quote for the live header ticker.
 * Twelve Data's /quote returns the latest close plus the day's change.
 */
export async function fetchQuote(symbol) {
  if (!API_KEY) {
    throw new Error('Missing API key. Add VITE_TWELVE_DATA_KEY to .env.local.');
  }

  const url = `${BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Network error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (data.status === 'error') {
    throw new Error(data.message || 'Twelve Data returned an error.');
  }

  return {
    symbol: data.symbol,
    name: data.name,
    price: Number(data.close),
    change: Number(data.change),
    percentChange: Number(data.percent_change),
    isMarketOpen: data.is_market_open,
  };
}

