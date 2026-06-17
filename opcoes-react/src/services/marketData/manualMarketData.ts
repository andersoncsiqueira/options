import type {
  MarketDataProvider,
  Quote,
  HistoricalCandle,
  HistoryRange,
} from "./marketData.types";

const manualQuotes: Record<string, Quote> = {
  PETR4: {
    symbol: "PETR4",
    price: 37.5,
    change: 0.32,
    changePercent: 0.86,
    updatedAt: new Date().toISOString(),
  },
  VALE3: {
    symbol: "VALE3",
    price: 62.8,
    change: -0.45,
    changePercent: -0.71,
    updatedAt: new Date().toISOString(),
  },
};

function getDaysByRange(range: HistoryRange): number {
  if (range === "1w") return 7;
  if (range === "1m") return 30;
  return 252;
}

function generateManualHistory(
  symbol: string,
  range: HistoryRange
): HistoricalCandle[] {
  const days = getDaysByRange(range);

  const basePrice = manualQuotes[symbol]?.price ?? 30;

  const candles: HistoricalCandle[] = [];

  let price = basePrice;

  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);

    const randomReturn = (Math.random() - 0.49) * 0.024;

    price = price * (1 + randomReturn);

    const open = price * (1 + (Math.random() - 0.5) * 0.012);
    const high = Math.max(open, price) * (1 + Math.random() * 0.014);
    const low = Math.min(open, price) * (1 - Math.random() * 0.014);

    candles.push({
      date: date.toISOString().slice(0, 10),
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(price.toFixed(2)),
      volume: Math.floor(20_000_000 + Math.random() * 70_000_000),
    });
  }

  return candles;
}

export const manualMarketDataProvider: MarketDataProvider = {
  async getQuote(symbol: string): Promise<Quote | null> {
    const cleanSymbol = symbol.trim().toUpperCase();

    return manualQuotes[cleanSymbol] ?? null;
  },

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const quotes = await Promise.all(
      symbols.map((symbol) => this.getQuote(symbol))
    );

    return quotes.filter((quote): quote is Quote => quote !== null);
  },

  async getHistory(
    symbol: string,
    range: HistoryRange
  ): Promise<HistoricalCandle[]> {
    const cleanSymbol = symbol.trim().toUpperCase();

    return generateManualHistory(cleanSymbol, range);
  },
};