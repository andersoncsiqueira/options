import type {
  AssetAnalytics,
  AssetCandle,
  AssetVolatilityPoint,
} from "../types/asset";

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

/**
 * Mock temporário.
 *
 * Depois essa função pode ser trocada por uma API real, por exemplo:
 * - Brapi
 * - Yahoo Finance via backend
 * - Alpha Vantage
 * - API da sua corretora
 * - Dados manuais importados por CSV
 */
function generateMockPetrobrasHistory(): AssetCandle[] {
  const candles: AssetCandle[] = [];

  let price = 37.5;

  for (let i = 180; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);

    const randomReturn = (Math.random() - 0.48) * 0.025;
    price = price * (1 + randomReturn);

    const open = price * (1 + (Math.random() - 0.5) * 0.01);
    const high = Math.max(open, price) * (1 + Math.random() * 0.01);
    const low = Math.min(open, price) * (1 - Math.random() * 0.01);

    candles.push({
      date: date.toISOString().slice(0, 10),
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(price.toFixed(2)),
      volume: Math.floor(20_000_000 + Math.random() * 60_000_000),
    });
  }

  return candles;
}

export async function getAssetAnalytics(
  symbol: string
): Promise<AssetAnalytics> {
  const candles = generateMockPetrobrasHistory();

  const lastCandle = candles[candles.length - 1];
  const previousCandle = candles[candles.length - 2];

  const currentPrice = lastCandle.close;
  const previousPrice = previousCandle.close;

  const dailyChange = currentPrice - previousPrice;
  const dailyChangePercent = previousPrice
    ? dailyChange / previousPrice
    : 0;

  const annualizedVolatility = calculateAnnualizedVolatility(candles);
  const volatilitySeries = calculateRollingVolatility(candles, 21);

  return {
    symbol,
    currentPrice,
    previousPrice,
    dailyChange,
    dailyChangePercent,
    annualizedVolatility,
    candles,
    volatilitySeries,
  };
}