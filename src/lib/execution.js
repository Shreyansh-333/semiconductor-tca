// Execution simulator — turns a parent order into child fills across the bars.
// Pure functions only (no React, no network), so the logic is easy to test and
// to reason about. The TCA metrics that consume these fills live in metrics.js.

const BPS = 10000; // 1 = 100%, so 1 basis point = 0.0001 of price.

// ---- Execution-cost model constants (in basis points; 1 bp = 0.01%) ----
const HALF_SPREAD_BPS = 1; // cost of crossing half the quoted bid/ask spread
const IMPACT_BPS = 8; // market-impact scale at full aggressiveness & 100% participation
const NOISE_BPS = 1.5; // random per-fill execution noise

/** Proxy for the average traded price during a single bar. */
export function typicalPrice(bar) {
  return (bar.high + bar.low + bar.close) / 3;
}

/**
 * Every algo has an "aggressiveness" in [0,1] describing how hard it pushes for
 * immediacy. More aggressive => it crosses more of the spread, pays more market
 * impact, and has noisier fills. This single dial is what scales the cost model
 * in fillPrice() below, so the four algos end up with realistically different
 * execution costs even on the same price path.
 */
function aggressivenessFor(algo, povRate) {
  switch (algo) {
    case 'VWAP':
      // Hides inside the day's volume profile — the most passive of the four.
      return 0.2;
    case 'TWAP':
      // Steady, clock-driven slices; mildly more aggressive than VWAP.
      return 0.35;
    case 'POV':
      // Aggressiveness tracks the chosen participation rate: taking 20%+ of each
      // bar's volume is very aggressive; a few percent is gentle.
      return Math.min(1, Math.max(0.2, povRate / 0.2));
    case 'IS':
      // Front-loaded: deliberately trades fast to cut timing risk, so it is the
      // most aggressive and pays the most impact.
      return 0.85;
    default:
      return 0.3;
  }
}

/**
 * Turn one child slice into a realistic fill price.
 *
 *   fillPrice = barPrice + side * (half-spread + market-impact + noise)
 *
 * - half-spread : you cross part of the bid/ask; aggressive orders cross more.
 * - market-impact: SQUARE-ROOT model — impact grows with the square root of how
 *   much of the bar's volume you consume (the standard Almgren-style assumption:
 *   doubling participation does NOT double impact).
 * - noise        : small random slippage so repeated fills aren't identical.
 *
 * side = +1 for a buy (you pay up), -1 for a sell (you give up price).
 */
function fillPrice(barPrice, shares, barVolume, side, aggressiveness) {
  const participation = barVolume > 0 ? shares / barVolume : 0;

  const spreadBps = HALF_SPREAD_BPS * (1 + aggressiveness);
  const impactBps = IMPACT_BPS * aggressiveness * Math.sqrt(participation);
  const noiseBps = NOISE_BPS * aggressiveness * (Math.random() * 2 - 1);

  const slipBps = spreadBps + impactBps + noiseBps;
  return barPrice * (1 + (side * slipBps) / BPS);
}

/**
 * Allocate `quantity` shares across `bars` according to an execution algo, then
 * price every child fill through the spread/impact model above.
 *
 * @param {Object} order
 * @param {'buy'|'sell'} order.side
 * @param {number} order.quantity   total parent-order shares
 * @param {'TWAP'|'VWAP'|'POV'|'IS'} order.algo
 * @param {number} [order.povRate]  participation fraction for POV (e.g. 0.1 = 10%)
 * @returns {Array<{datetime, shares, barPrice, participation, price}>}
 */
export function simulateExecution(bars, { side, quantity, algo, povRate = 0.1 }) {
  if (!bars.length || quantity <= 0) return [];

  const sign = side === 'sell' ? -1 : 1;
  const aggressiveness = aggressivenessFor(algo, povRate);
  const n = bars.length;

  // --- Step 1: decide how many shares to TARGET in each bar (the "schedule") ---
  let target;

  if (algo === 'TWAP') {
    // TWAP — Time-Weighted Average Price.
    // Slice the order into N EQUAL pieces, one per bar, ignoring volume.
    // Goal: track the average price over the *clock*. Simple and predictable,
    // but it over-trades in thin bars and under-trades in busy ones.
    target = bars.map(() => quantity / n);
  } else if (algo === 'VWAP') {
    // VWAP — Volume-Weighted Average Price.
    // Trade in proportion to each bar's volume: do MORE when the market is busy,
    // LESS when it's quiet. Goal: match the day's VWAP benchmark and minimise
    // footprint by hiding inside the natural liquidity.
    const totalVol = bars.reduce((s, b) => s + b.volume, 0);
    target =
      totalVol > 0
        ? bars.map((b) => quantity * (b.volume / totalVol))
        : bars.map(() => quantity / n); // fall back to TWAP if no volume data
  } else if (algo === 'POV') {
    // POV — Percent Of Volume (a.k.a. participation algo).
    // In every bar, trade a FIXED fraction `povRate` of that bar's volume
    // (e.g. 10%), capped by whatever quantity is still left. The order finishes
    // once filled; in a thin market it may NOT complete inside the window.
    // Unlike VWAP (which pre-plans a full schedule), POV reacts bar-by-bar to
    // the live volume that actually prints.
    let remaining = quantity;
    target = bars.map((b) => {
      if (remaining <= 0) return 0;
      const want = povRate * b.volume;
      const take = Math.min(want, remaining);
      remaining -= take;
      return take;
    });
  } else {
    // IS — Implementation Shortfall (front-loaded).
    // The benchmark is the ARRIVAL price, so the enemy is timing risk: the
    // longer you wait, the more the price can drift away from arrival. IS trades
    // HARDEST at the start and tapers off, accepting higher market impact early
    // in exchange for less exposure to adverse drift. Weights decay exponentially
    // over time, so the first bars get the largest slices.
    const decay = 3; // higher => more front-loaded
    const weights = bars.map((_, i) => Math.exp((-decay * i) / n));
    const wSum = weights.reduce((s, w) => s + w, 0);
    target = weights.map((w) => quantity * (w / wSum));
  }

  // --- Step 2: price each non-empty slice through the spread + impact model ---
  return bars
    .map((bar, i) => {
      const shares = target[i];
      if (shares <= 0) return null;
      const barPrice = typicalPrice(bar);
      return {
        datetime: bar.datetime,
        shares,
        barPrice,
        participation: bar.volume > 0 ? shares / bar.volume : 0,
        price: fillPrice(barPrice, shares, bar.volume, sign, aggressiveness),
      };
    })
    .filter(Boolean);
}
