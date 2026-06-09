import type { MarketDataProvider, Quote } from "./marketData.types";

const manualQuotes: Record<string, Quote> = {
  PETR4: {
    symbol: "PETR4",
    last: 38.42,
    bid: 38.41,
    ask: 38.43,
    updatedAt: new Date().toISOString(),
    source: "manual",
  },

  VALE3: {
    symbol: "VALE3",
    last: 61.1,
    bid: 61.08,
    ask: 61.12,
    updatedAt: new Date().toISOString(),
    source: "manual",
  },
};

export const manualMarketDataProvider: MarketDataProvider = {
  async getQuote(symbol: string) {
    const normalized = symbol.toUpperCase();

    return manualQuotes[normalized] ?? null;
  },

  async getQuotes(symbols: string[]) {
    const results = await Promise.all(
      symbols.map((symbol) => this.getQuote(symbol))
    );

    return results.filter((quote): quote is Quote => quote !== null);
  },
};