import type {
  MarketDataProvider,
  Quote,
  HistoricalCandle,
  HistoryRange,
} from "./marketData/marketData.types";

import { getAssetHistory, getAssetQuote } from "../services/optionsMarketApi";

type ApiRecord = Record<string, unknown>;

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function isRecord(value: unknown): value is ApiRecord {
  return typeof value === "object" && value !== null;
}

function toNumber(value: unknown): number | undefined {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function normalizeDate(value: unknown): string {
  if (typeof value === "number") {
    const timestamp = value < 1_000_000_000_000 ? value * 1000 : value;
    return new Date(timestamp).toISOString().slice(0, 10);
  }

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  return new Date().toISOString().slice(0, 10);
}

function unwrapQuote(raw: unknown): ApiRecord {
  if (!isRecord(raw)) return {};

  if (isRecord(raw.data)) return raw.data;
  if (isRecord(raw.quote)) return raw.quote;

  return raw;
}

function unwrapHistory(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;

  if (!isRecord(raw)) return [];

  if (Array.isArray(raw.data)) return raw.data;
  if (Array.isArray(raw.history)) return raw.history;
  if (Array.isArray(raw.candles)) return raw.candles;
  if (Array.isArray(raw.prices)) return raw.prices;

  return [];
}

function normalizeQuote(raw: unknown, fallbackSymbol: string): Quote | null {
  const data = unwrapQuote(raw);

  const price =
    toNumber(data.price) ??
    toNumber(data.currentPrice) ??
    toNumber(data.close) ??
    toNumber(data.regularMarketPrice);

  if (price === undefined) {
    return null;
  }

  return {
    symbol: String(data.symbol ?? fallbackSymbol).toUpperCase(),
    price,
    change:
      toNumber(data.change) ??
      toNumber(data.dailyChange) ??
      toNumber(data.regularMarketChange),
    changePercent:
      toNumber(data.changePercent) ??
      toNumber(data.dailyChangePercent) ??
      toNumber(data.regularMarketChangePercent),
    updatedAt:
      typeof data.updatedAt === "string"
        ? data.updatedAt
        : new Date().toISOString(),
  };
}

function normalizeHistory(raw: unknown): HistoricalCandle[] {
  const rawCandles = unwrapHistory(raw);
  const normalizedCandles: HistoricalCandle[] = [];

  rawCandles.forEach((rawItem) => {
    if (!isRecord(rawItem)) return;

    const close =
      toNumber(rawItem.close) ??
      toNumber(rawItem.price) ??
      toNumber(rawItem.adjClose) ??
      toNumber(rawItem.regularMarketPrice);

    if (close === undefined) return;

    const open = toNumber(rawItem.open) ?? close;
    const high = toNumber(rawItem.high) ?? Math.max(open, close);
    const low = toNumber(rawItem.low) ?? Math.min(open, close);

    normalizedCandles.push({
      date: normalizeDate(
        rawItem.date ?? rawItem.datetime ?? rawItem.time ?? rawItem.timestamp
      ),
      open,
      high,
      low,
      close,
      volume: toNumber(rawItem.volume),
    });
  });

  return normalizedCandles.sort((a, b) => a.date.localeCompare(b.date));
}

export const apiMarketDataProvider: MarketDataProvider = {
  async getQuote(symbol: string): Promise<Quote | null> {
    const cleanSymbol = normalizeSymbol(symbol);

    console.log("Buscando cotação real da API:", cleanSymbol);

    const response = await getAssetQuote(cleanSymbol);

    return normalizeQuote(response, cleanSymbol);
  },

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const quotes = await Promise.all(
      symbols.map((symbol) => apiMarketDataProvider.getQuote(symbol))
    );

    return quotes.filter((quote): quote is Quote => quote !== null);
  },

  async getHistory(
    symbol: string,
    range: HistoryRange
  ): Promise<HistoricalCandle[]> {
    const cleanSymbol = normalizeSymbol(symbol);

    console.log("Buscando histórico real da API:", cleanSymbol, range);

    const response = await getAssetHistory(cleanSymbol, range);

    return normalizeHistory(response);
  },
};