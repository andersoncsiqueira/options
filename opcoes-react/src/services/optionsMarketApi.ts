const API_BASE_URL = import.meta.env.VITE_OPTIONS_API_URL;

export type HistoryRange = "1w" | "1m" | "1y";

export type ApiHealthResponse = {
  ok: boolean;
  name: string;
  updatedAt: string;
};

export type OptionMarketData = {
  symbol: string;
  underlying?: string;
  type?: "call" | "put";
  strike?: number;
  expirationDate?: string;
  lastPrice?: number;
  bid?: number;
  ask?: number;
  volume?: number;
  financialVolume?: number;
  trades?: number;
  quoteUpdatedAt?: string;
  [key: string]: unknown;
};

export type OptionsChainResponse =
  | OptionMarketData[]
  | {
      data?: unknown;
      options?: unknown;
      calls?: unknown;
      puts?: unknown;
      [key: string]: unknown;
    };

async function apiRequest<T>(endpoint: string): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error("VITE_OPTIONS_API_URL não configurada no .env.local");
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`);

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Erro na API: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  return response.json() as Promise<T>;
}

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase();
}

export function checkApiHealth() {
  return apiRequest<ApiHealthResponse>("/api/health");
}

export function getAssetQuote(symbol: string) {
  const normalizedSymbol = normalizeSymbol(symbol);

  return apiRequest(`/api/market-data/${normalizedSymbol}/quote`);
}

export function getAssetHistory(
  symbol: string,
  range: HistoryRange = "1y"
) {
  const normalizedSymbol = normalizeSymbol(symbol);

  return apiRequest(
    `/api/market-data/${normalizedSymbol}/history?range=${range}`
  );
}

export function getAssetEvents(symbol: string) {
  const normalizedSymbol = normalizeSymbol(symbol);

  return apiRequest(`/api/market-data/${normalizedSymbol}/events`);
}

export function getOptionBySymbol(optionSymbol: string): Promise<OptionMarketData | unknown> {
  const normalizedSymbol = normalizeSymbol(optionSymbol);

  return apiRequest(`/api/options/${normalizedSymbol}`);
}

export function getOptionHistory(
  optionSymbol: string,
  range: HistoryRange = "1m"
) {
  const normalizedSymbol = normalizeSymbol(optionSymbol);

  return apiRequest(
    `/api/options/${normalizedSymbol}/history?range=${range}`
  );
}

export function getOptionsChain(underlying: string): Promise<OptionsChainResponse> {
  const normalizedUnderlying = normalizeSymbol(underlying);

  return apiRequest(`/api/options-chain/${normalizedUnderlying}`);
}