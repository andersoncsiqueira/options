import type {
  Quote,
  HistoricalCandle,
  HistoryRange,
} from "./marketData.types";

const API_BASE_URL = import.meta.env.VITE_OPTIONS_API_URL;

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

async function apiRequest<T>(endpoint: string): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error("VITE_OPTIONS_API_URL não configurada no .env.local");
  }

  const url = `${API_BASE_URL}${endpoint}`;

  console.log("[marketDataService] Chamando API real:", url);

  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Erro na API: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  return response.json() as Promise<T>;
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

  if (isRecord(raw.data)) {
    if (Array.isArray(raw.data.history)) return raw.data.history;
    if (Array.isArray(raw.data.candles)) return raw.data.candles;
    if (Array.isArray(raw.data.prices)) return raw.data.prices;
  }

  return [];
}

function normalizeQuote(raw: unknown, fallbackSymbol: string): Quote | null {
  const data = unwrapQuote(raw);

  const price =
    toNumber(data.price) ??
    toNumber(data.currentPrice) ??
    toNumber(data.regularMarketPrice) ??
    toNumber(data.lastPrice) ??
    toNumber(data.close);

  if (price === undefined) {
    console.log("[marketDataService] Cotação sem preço válido:", raw);
    return null;
  }

  return {
    symbol: String(data.symbol ?? fallbackSymbol).toUpperCase(),
    price,
    bid:
      toNumber(data.bid) ??
      toNumber(data.bidPrice) ??
      toNumber(data.regularMarketBid),
    ask:
      toNumber(data.ask) ??
      toNumber(data.askPrice) ??
      toNumber(data.regularMarketAsk),
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

  console.log("[marketDataService] Histórico bruto recebido:", raw);
  console.log("[marketDataService] Candles encontrados:", rawCandles.length);

  const candles: HistoricalCandle[] = [];

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

    candles.push({
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

  return candles.sort((a, b) => a.date.localeCompare(b.date));
}

export async function getQuote(symbol: string): Promise<Quote | null> {
  const cleanSymbol = normalizeSymbol(symbol);

  const response = await apiRequest<unknown>(
    `/api/market-data/${cleanSymbol}/quote`
  );

  return normalizeQuote(response, cleanSymbol);
}

export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  const quotes = await Promise.all(
    symbols.map((symbol) => getQuote(symbol))
  );

  return quotes.filter((quote): quote is Quote => quote !== null);
}

export async function getHistory(
  symbol: string,
  range: HistoryRange
): Promise<HistoricalCandle[]> {
  const cleanSymbol = normalizeSymbol(symbol);

  const response = await apiRequest<unknown>(
    `/api/market-data/${cleanSymbol}/history?range=${range}`
  );

  return normalizeHistory(response);
}