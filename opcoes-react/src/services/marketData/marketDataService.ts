import type { MarketDataProvider, Quote } from "./marketData.types";
import { manualMarketDataProvider } from "./manualMarketData";

let activeProvider: MarketDataProvider = manualMarketDataProvider;

export function setMarketDataProvider(provider: MarketDataProvider) {
  activeProvider = provider;
}

export async function getQuote(symbol: string): Promise<Quote | null> {
  return activeProvider.getQuote(symbol);
}

export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  return activeProvider.getQuotes(symbols);
}