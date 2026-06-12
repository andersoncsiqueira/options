import type {
  AssetAnalytics,
  AssetCandle,
  AssetVolatilityPoint,
} from "../types/asset";

import { getHistory, getQuote } from "./marketData/marketDataService";

function average(values: number[]): number {
  if (values.length === 0) return 0;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;

  const avg = average(values);

  const variance =
    values.reduce((sum, value) => {
      return sum + Math.pow(value - avg, 2);
    }, 0) /
    (values.length - 1);

  return Math.sqrt(variance);
}

function calculateLogReturns(candles: AssetCandle[]): number[] {
  const returns: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const previousClose = candles[i - 1].close;
    const currentClose = candles[i].close;

    if (previousClose > 0 && currentClose > 0) {
      returns.push(Math.log(currentClose / previousClose));
    }
  }

  return returns;
}

function calculateAnnualizedVolatility(candles: AssetCandle[]): number {
  const logReturns = calculateLogReturns(candles);
  const dailyVolatility = standardDeviation(logReturns);

  return dailyVolatility * Math.sqrt(252);
}

function calculateRollingVolatility(
  candles: AssetCandle[],
  windowSize = 21
): AssetVolatilityPoint[] {
  const result: AssetVolatilityPoint[] = [];

  for (let i = windowSize; i < candles.length; i++) {
    const windowCandles = candles.slice(i - windowSize, i + 1);
    const annualizedVol = calculateAnnualizedVolatility(windowCandles);

    result.push({
      date: candles[i].date,
      volatility: annualizedVol,
    });
  }

  return result;
}

function normalizeChangePercent(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;

  // API pode mandar 0.86 para 0,86%.
  // A tela normalmente espera 0.0086.
  if (Math.abs(value) > 1) {
    return value / 100;
  }

  return value;
}

export async function getAssetAnalytics(
  symbol: string
): Promise<AssetAnalytics> {
  const cleanSymbol = symbol.trim().toUpperCase();

  const [quote, candles] = await Promise.all([
    getQuote(cleanSymbol),
    getHistory(cleanSymbol, "1y"),
  ]);

  if (candles.length < 2) {
    throw new Error(`Histórico insuficiente para ${cleanSymbol}.`);
  }

  const lastCandle = candles[candles.length - 1];
  const previousCandle = candles[candles.length - 2];

  const currentPrice = quote?.price ?? lastCandle.close;

  const dailyChange = quote?.change ?? currentPrice - previousCandle.close;

  const dailyChangePercent =
    normalizeChangePercent(quote?.changePercent) ??
    (previousCandle.close ? dailyChange / previousCandle.close : 0);

  const annualizedVolatility = calculateAnnualizedVolatility(candles);
  const volatilitySeries = calculateRollingVolatility(candles, 21);

  return {
    symbol: cleanSymbol,
    currentPrice,
    previousPrice: previousCandle.close,
    dailyChange,
    dailyChangePercent,
    annualizedVolatility,
    candles,
    volatilitySeries,
  };
}