// TCA metrics module — turns simulated fills into transaction-cost analytics.
// All cost figures are SIGNED so that POSITIVE always means WORSE execution,
// for both buys and sells (see `sign` below). Costs are reported both in basis
// points (bps; 1 bp = 0.01%) and in account currency.

import { simulateExecution, typicalPrice } from './execution';

const BPS = 10000;

/**
 * Benchmarks that depend only on the market (not on which algo we ran):
 * - arrivalPrice: the price the moment the order arrived (the decision price).
 * - intervalVwap: volume-weighted average price across the execution window.
 * - totalVolume : total shares the market printed in the window (for participation).
 */
export function marketBenchmarks(bars) {
  const arrivalPrice = bars[0].open;
  const totalVolume = bars.reduce((s, b) => s + b.volume, 0);
  const intervalVwap =
    totalVolume > 0
      ? bars.reduce((s, b) => s + typicalPrice(b) * b.volume, 0) / totalVolume
      : bars.reduce((s, b) => s + typicalPrice(b), 0) / bars.length;
  return { arrivalPrice, intervalVwap, totalVolume };
}

/**
 * Compute the full TCA metric set for ONE order's fills.
 *
 * Metrics returned:
 * - avgExecPrice            : our volume-weighted average fill price.
 * - implementationShortfallBps : avg exec vs the ARRIVAL price — the all-in cost
 *                            of the decision-to-done journey (impact + timing).
 * - vwapSlippageBps         : avg exec vs interval VWAP — did we beat or lag the
 *                            volume-weighted benchmark the desk is judged on?
 * - participationRate       : filled shares ÷ total market volume — our footprint
 *                            in the market (how big we were relative to everyone).
 * - fillRate                : filled shares ÷ ordered quantity — how much of the
 *                            parent order actually completed (POV can fall short).
 * - totalCost               : implementation shortfall expressed in currency.
 */
export function computeMetrics(bars, fills, order) {
  const { side, quantity } = order;
  // Buy: paying ABOVE a benchmark is a cost (+). Sell: receiving BELOW it is a
  // cost — flipping the sign makes "positive = worse" hold for both directions.
  const sign = side === 'sell' ? -1 : 1;

  const { arrivalPrice, intervalVwap, totalVolume } = marketBenchmarks(bars);

  const filledShares = fills.reduce((s, f) => s + f.shares, 0);
  const avgExecPrice =
    filledShares > 0 ? fills.reduce((s, f) => s + f.price * f.shares, 0) / filledShares : 0;

  const implementationShortfallBps =
    avgExecPrice > 0 ? (sign * (avgExecPrice - arrivalPrice) / arrivalPrice) * BPS : 0;
  const vwapSlippageBps =
    avgExecPrice > 0 ? (sign * (avgExecPrice - intervalVwap) / intervalVwap) * BPS : 0;

  const fillRate = quantity > 0 ? filledShares / quantity : 0;
  const participationRate = totalVolume > 0 ? filledShares / totalVolume : 0;

  const notional = avgExecPrice * filledShares;
  const totalCost = sign * (avgExecPrice - arrivalPrice) * filledShares;

  return {
    arrivalPrice,
    intervalVwap,
    avgExecPrice,
    filledShares,
    fillRate,
    participationRate,
    notional,
    implementationShortfallBps,
    vwapSlippageBps,
    totalCost,
  };
}

/** Per-order rollup: simulate the order, then score it. */
export function analyzeOrder(bars, order) {
  const fills = simulateExecution(bars, order);
  return computeMetrics(bars, fills, order);
}

/** The four execution algos, in display order. */
export const ALGOS = ['TWAP', 'VWAP', 'POV', 'IS'];

/**
 * Per-algo rollup: run the SAME parent order through every algo and score each,
 * so they can be compared side by side. Returns one row per algo.
 */
export function analyzeAllAlgos(bars, order) {
  return ALGOS.map((algo) => ({ algo, ...analyzeOrder(bars, { ...order, algo }) }));
}
