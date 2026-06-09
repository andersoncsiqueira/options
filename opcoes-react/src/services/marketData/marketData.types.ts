export interface Quote {
  symbol: string;
  last: number;
  bid?: number;
  ask?: number;
  updatedAt: string;
  source: "manual" | "mock" | "yahoo" | "alphaVantage";
}

export interface MarketDataProvider {
  getQuote(symbol: string): Promise<Quote | null>;
  getQuotes(symbols: string[]): Promise<Quote[]>;
}