export type AssetCandle = {
  date: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
};

export type AssetVolatilityPoint = {
  date: string;
  volatility: number;
};

export type AssetAnalytics = {
  symbol: string;
  currentPrice: number;
  previousPrice: number;
  dailyChange: number;
  dailyChangePercent: number;
  annualizedVolatility: number;
  candles: AssetCandle[];
  volatilitySeries: AssetVolatilityPoint[];
};