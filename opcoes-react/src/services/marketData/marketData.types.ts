export type Quote = {
  symbol: string;
  price: number;
  bid?: number;
  ask?: number;
  change?: number;
  changePercent?: number;
  updatedAt?: string;
};

export type HistoricalCandle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type HistoryRange = "1w" | "1m" | "1y";

export interface MarketDataProvider {
  getQuote(symbol: string): Promise<Quote | null>;
  getQuotes(symbols: string[]): Promise<Quote[]>;

  getHistory(
    symbol: string,
    range: HistoryRange
  ): Promise<HistoricalCandle[]>;
}