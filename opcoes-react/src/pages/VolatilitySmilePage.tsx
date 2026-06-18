import {
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import Layout from "../components/Layout/Layout";
import {
  getAssetQuote,
  getOptionBySymbol,
  getOptionsChain,
} from "../services/optionsMarketApi";

type OptionType = "call" | "put";
type OptionSource = "automatic" | "manual";
type ApiRecord = Record<string, unknown>;
type DebugLogger = (entry: {
  level: "info" | "success" | "warning" | "error";
  step: string;
  message: string;
  data?: unknown;
}) => void;

type OptionChainItem = {
  symbol: string;
  underlying?: string;
  type: OptionType | "unknown";
  strike?: number;
  expirationDate?: string;
  lastPrice?: number;
  bid?: number;
  ask?: number;
  volume?: number;
  financialVolume?: number;
  trades?: number;
  quoteUpdatedAt?: string;
  raw: unknown;
};

type ResolvedOption = {
  optionCode: string;
  underlying: string;
  optionType: OptionType;
  strike: number;
  expirationDate: string;
  marketPrice: number;
  spotPrice: number;
  bid?: number;
  ask?: number;
  volume?: number;
  financialVolume?: number;
  trades?: number;
  quoteUpdatedAt?: string;
};

type OptionDraft = {
  optionCode: string;
  underlying: string;
  optionType: OptionType;
  strike: string;
  expirationDate: string;
  marketPrice: string;
  spotPrice: string;
  bid?: number;
  ask?: number;
  volume?: number;
  financialVolume?: number;
  trades?: number;
  quoteUpdatedAt?: string;
};

type FreshOptionData = {
  lastPrice?: number;
  bid?: number;
  ask?: number;
  volume?: number;
  financialVolume?: number;
  trades?: number;
  quoteUpdatedAt?: string;
};

type SmileChartItem = {
  strike: number;
  optionCode: string;
  impliedVolatility: number | null;
  marketPrice: number;
  theoreticalPrice: number;
  bid: number | null;
  ask: number | null;
  spread: number | null;
  spreadPercent: number | null;
  volume: number | null;
  trades: number | null;
  averageVolumePerTrade: number | null;
  financialVolume: number | null;
  quoteUpdatedAt: string | null;
};

type SmileOption = ResolvedOption & {
  id: string;
  theoreticalPrice: number;
  impliedVolatility: number | null;
  source: OptionSource;
};

const DEFAULT_RISK_FREE_RATE = 0.145;

const UNDERLYING_FALLBACKS: Record<string, string> = {
  PETR: "PETR4",
  VALE: "VALE3",
  BOVA: "BOVA11",
  ITUB: "ITUB4",
  BBDC: "BBDC4",
  BBAS: "BBAS3",
  ABEV: "ABEV3",
  MGLU: "MGLU3",
  WEGE: "WEGE3",
  RENT: "RENT3",
  SUZB: "SUZB3",
  PRIO: "PRIO3",
};

function errorToDebugData(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return error;
}

function isRecord(value: unknown): value is ApiRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFirst(record: ApiRecord, keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return undefined;
}

function hasOptionIdentity(record: ApiRecord): boolean {
  return Boolean(
    readFirst(record, [
      "symbol",
      "code",
      "ticker",
      "optionCode",
      "option_code",
      "strike",
      "strikePrice",
      "strike_price",
      "exercisePrice",
      "exercise_price",
      "expiration",
      "expirationDate",
      "expiration_date",
      "underlying",
      "underlyingSymbol",
      "type",
      "seriesLetter",
      "codeNumber",
    ])
  );
}

function unwrapObject(raw: unknown): ApiRecord {
  if (!isRecord(raw)) return {};

  /*
   * Quando a resposta já representa uma opção completa, preservamos o
   * objeto principal. O objeto quote contém somente preço/volume e não
   * pode substituir strike, vencimento e ativo-objeto.
   */
  if (hasOptionIdentity(raw)) return raw;

  if (isRecord(raw.data)) return unwrapObject(raw.data);
  if (isRecord(raw.option)) return unwrapObject(raw.option);
  if (isRecord(raw.result)) return unwrapObject(raw.result);
  if (isRecord(raw.quote)) return unwrapObject(raw.quote);

  return raw;
}

function toText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;

  const text = String(value).trim();

  return text || undefined;
}

function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  const text = String(value)
    .trim()
    .replace("R$", "")
    .replace(/\s/g, "");

  if (!text) return undefined;

  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function toCount(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 && Number.isInteger(value)
      ? value
      : undefined;
  }
  let text = String(value).trim().replace(/\s/g, "");
  if (!text) return undefined;
  if (/^-/.test(text)) return undefined;
  if (/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, "");
  else if (/^\d{1,3}(,\d{3})+$/.test(text)) text = text.replace(/,/g, "");
  else if (!/^[0-9]+$/.test(text)) return undefined;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function normalizeTimestamp(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  const text = String(value).trim();
  if (!text) return undefined;
  if (/^\d+$/.test(text)) return normalizeTimestamp(Number(text));
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?/);
  const normalized = br ? `${br[3]}-${br[2]}-${br[1]}T${br[4] || "00:00:00"}-03:00` : text;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function toInputNumber(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "";

  return String(Number(value.toFixed(6))).replace(".", ",");
}

function normalizeDateForInput(value?: string): string {
  if (!value) return "";

  const text = value.trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);

  if (brMatch) {
    return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  }

  const parsed = new Date(text);

  if (Number.isNaN(parsed.getTime())) return "";

  return parsed.toISOString().slice(0, 10);
}

function formatDisplayDate(value?: string): string {
  const normalized = normalizeDateForInput(value);

  if (!normalized) return "—";

  const [year, month, day] = normalized.split("-");

  return `${day}/${month}/${year}`;
}

function normalizeUnderlying(value?: string): string {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\.SA$/, "");

  return UNDERLYING_FALLBACKS[normalized] || normalized;
}

function inferUnderlyingFromOptionCode(optionCode: string): string {
  const prefix = optionCode.trim().toUpperCase().match(/^[A-Z]{4}/)?.[0];

  return prefix ? normalizeUnderlying(prefix) : "";
}

function inferOptionType(
  symbol: string,
  raw?: ApiRecord
): OptionType | "unknown" {
  const explicitType = raw
    ? toText(
        readFirst(raw, [
          "type",
          "optionType",
          "option_type",
          "kind",
          "side",
          "callPut",
        ])
      )?.toLowerCase()
    : undefined;

  if (explicitType) {
    if (
      explicitType.includes("put") ||
      explicitType.includes("venda") ||
      explicitType === "p"
    ) {
      return "put";
    }

    if (
      explicitType.includes("call") ||
      explicitType.includes("compra") ||
      explicitType === "c"
    ) {
      return "call";
    }
  }

  const seriesLetter = symbol.toUpperCase().match(/^[A-Z]{4}([A-X])/)?.[1];

  if (!seriesLetter) return "unknown";
  if ("ABCDEFGHIJKL".includes(seriesLetter)) return "call";
  if ("MNOPQRSTUVWX".includes(seriesLetter)) return "put";

  return "unknown";
}

function normalizeOption(rawOption: unknown): OptionChainItem | null {
  if (!isRecord(rawOption)) return null;

  const quote = isRecord(rawOption.quote) ? rawOption.quote : {};

  const symbol = toText(
    readFirst(rawOption, [
      "symbol",
      "code",
      "ticker",
      "optionSymbol",
      "option_symbol",
      "optionCode",
      "option_code",
      "contractSymbol",
      "contract_symbol",
      "asset",
      "ativo",
    ]) ??
      readFirst(quote, [
        "symbol",
        "code",
        "ticker",
        "optionSymbol",
        "optionCode",
      ])
  )?.toUpperCase();

  if (!symbol) return null;

  const priceKeys = [
    "lastPrice",
    "last_price",
    "price",
    "currentPrice",
    "current_price",
    "close",
    "regularMarketPrice",
    "regular_market_price",
    "premium",
    "premio",
    "ultimo",
    "último",
  ];

  const bidKeys = [
    "bid",
    "bidPrice",
    "bid_price",
    "compra",
  ];

  const askKeys = [
    "ask",
    "askPrice",
    "ask_price",
    "venda",
  ];

  const volumeKeys = [
    "volume",
    "regularMarketVolume",
    "regular_market_volume",
    "volumeNegociado",
    "volume_negociado",
    "qtdNegociada",
    "quantidadeNegociada",
  ];

  const financialVolumeKeys = [
    "financialVolume",
    "financial_volume",
    "volumeFinanceiro",
    "volume_financeiro",
    "turnover",
  ];

  const tradesKeys = [
    "trades",
    "tradeCount",
    "trade_count",
    "numberOfTrades",
    "number_of_trades",
    "negocios",
    "negócios",
    "numeroNegocios",
    "numero_negocios",
    "qtdNegocios",
    "quantidadeNegocios",
    "transactions",
    "deals",
    "businesses",
  ];

  const quoteUpdatedAtKeys = [
    "quoteUpdatedAt",
    "updatedAt",
    "lastUpdate",
    "lastTradeTime",
    "regularMarketTime",
    "timestamp",
    "datetime",
    "dataHora",
    "horario",
  ];

  return {
    symbol,
    underlying: normalizeUnderlying(
      toText(
        readFirst(rawOption, [
          "underlying",
          "underlyingSymbol",
          "underlying_symbol",
          "underlyingAsset",
          "ativoObjeto",
          "ativo_objeto",
          "assetUnderlying",
        ])
      ) || inferUnderlyingFromOptionCode(symbol)
    ),
    type: inferOptionType(symbol, rawOption),
    strike: toNumber(
      readFirst(rawOption, [
        "strike",
        "strikePrice",
        "strike_price",
        "exercisePrice",
        "exercise_price",
        "precoExercicio",
        "preco_exercicio",
      ])
    ),
    expirationDate: normalizeDateForInput(
      toText(
        readFirst(rawOption, [
          "expirationDate",
          "expiration_date",
          "expiration",
          "maturityDate",
          "maturity_date",
          "dueDate",
          "due_date",
          "vencimento",
        ])
      )
    ),
    lastPrice: toNumber(
      readFirst(rawOption, priceKeys) ??
        readFirst(quote, priceKeys)
    ),
    bid: toNumber(
      readFirst(rawOption, bidKeys) ??
        readFirst(quote, bidKeys)
    ),
    ask: toNumber(
      readFirst(rawOption, askKeys) ??
        readFirst(quote, askKeys)
    ),
    volume: toCount(
      readFirst(rawOption, volumeKeys) ??
        readFirst(quote, volumeKeys)
    ),
    financialVolume: toNumber(
      readFirst(rawOption, financialVolumeKeys) ??
        readFirst(quote, financialVolumeKeys)
    ),
    trades: toCount(
      readFirst(rawOption, tradesKeys) ??
        readFirst(quote, tradesKeys)
    ),
    quoteUpdatedAt: normalizeTimestamp(
      readFirst(rawOption, quoteUpdatedAtKeys) ??
        readFirst(quote, quoteUpdatedAtKeys)
    ),
    raw: rawOption,
  };
}

function extractOptionCandidates(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];

  const candidates: unknown[] = [];

  for (const key of [
    "data",
    "options",
    "results",
    "items",
    "contracts",
    "chain",
    "optionChain",
  ]) {
    const value = payload[key];

    if (Array.isArray(value)) {
      candidates.push(...value);
    }
  }

  if (Array.isArray(payload.calls)) {
    candidates.push(
      ...payload.calls.map((item) =>
        isRecord(item) ? { ...item, type: item.type ?? "call" } : item
      )
    );
  }

  if (Array.isArray(payload.puts)) {
    candidates.push(
      ...payload.puts.map((item) =>
        isRecord(item) ? { ...item, type: item.type ?? "put" } : item
      )
    );
  }

  if (isRecord(payload.data)) {
    candidates.push(...extractOptionCandidates(payload.data));
  }

  if (isRecord(payload.optionChain)) {
    candidates.push(...extractOptionCandidates(payload.optionChain));
  }

  return candidates;
}

function normalizeOptionsPayload(payload: unknown): OptionChainItem[] {
  const normalized = extractOptionCandidates(payload)
    .map(normalizeOption)
    .filter((item): item is OptionChainItem => Boolean(item));

  const uniqueBySymbol = new Map<string, OptionChainItem>();

  for (const option of normalized) {
    uniqueBySymbol.set(option.symbol, option);
  }

  return Array.from(uniqueBySymbol.values()).sort((a, b) => {
    const dateCompare = String(a.expirationDate || "").localeCompare(
      String(b.expirationDate || "")
    );

    if (dateCompare !== 0) return dateCompare;

    return Number(a.strike || 0) - Number(b.strike || 0);
  });
}

function uniqueOptionChainItems(options: OptionChainItem[]): OptionChainItem[] {
  const map = new Map<string, OptionChainItem>();

  for (const option of options) {
    map.set(normalizeCode(option.symbol), option);
  }

  return Array.from(map.values()).sort((a, b) => {
    const dateCompare = String(a.expirationDate || "").localeCompare(
      String(b.expirationDate || "")
    );

    if (dateCompare !== 0) return dateCompare;

    return Number(a.strike || 0) - Number(b.strike || 0);
  });
}

function getPremiumFromOption(option: OptionChainItem): number | undefined {
  if (option.lastPrice !== undefined && option.lastPrice > 0) {
    return option.lastPrice;
  }

  if (
    option.bid !== undefined &&
    option.bid > 0 &&
    option.ask !== undefined &&
    option.ask > 0
  ) {
    return (option.bid + option.ask) / 2;
  }

  if (option.ask !== undefined && option.ask > 0) return option.ask;
  if (option.bid !== undefined && option.bid > 0) return option.bid;

  return undefined;
}

function normalizeQuotePrice(raw: unknown): number | undefined {
  if (!isRecord(raw)) return undefined;

  const root = raw;
  const data = isRecord(root.data) ? root.data : {};
  const rootQuote = isRecord(root.quote) ? root.quote : {};
  const dataQuote = isRecord(data.quote) ? data.quote : {};

  const priceKeys = [
    "price",
    "currentPrice",
    "current_price",
    "regularMarketPrice",
    "regular_market_price",
    "lastPrice",
    "last_price",
    "close",
    "premium",
    "premio",
    "ultimo",
    "último",
  ];

  const candidates = [root, data, rootQuote, dataQuote];

  for (const candidate of candidates) {
    const price = toNumber(readFirst(candidate, priceKeys));

    if (price !== undefined && price > 0) {
      return price;
    }
  }

  return undefined;
}

function normalizeCode(value: string): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\.SA$/, "")
    .replace(/[^A-Z0-9]/g, "");
}

function findOptionInChain(
  options: OptionChainItem[],
  searchedCode: string
): OptionChainItem | undefined {
  const normalizedSearch = normalizeCode(searchedCode);

  const exact = options.find(
    (option) => normalizeCode(option.symbol) === normalizedSearch
  );

  if (exact) return exact;

  const prefixMatches = options
    .filter((option) => {
      const candidate = normalizeCode(option.symbol);

      return (
        candidate.startsWith(normalizedSearch) ||
        normalizedSearch.startsWith(candidate)
      );
    })
    .sort(
      (a, b) =>
        Math.abs(normalizeCode(a.symbol).length - normalizedSearch.length) -
        Math.abs(normalizeCode(b.symbol).length - normalizedSearch.length)
    );

  return prefixMatches[0];
}

async function getFreshOptionData(
  optionCode: string,
  debug?: DebugLogger
): Promise<FreshOptionData | undefined> {
  const cleanCode = optionCode.trim().toUpperCase();

  debug?.({
    level: "info",
    step: "Prêmio",
    message: `Chamando getOptionBySymbol("${cleanCode}") para atualizar o prêmio da opção.`,
  });

  try {
    const response = await getOptionBySymbol(cleanCode);

    debug?.({
      level: "info",
      step: "Prêmio — resposta bruta",
      message: `Resposta recebida para ${cleanCode}.`,
      data: response,
    });

    const normalized = normalizeOption(unwrapObject(response));
    const price = normalized
      ? getPremiumFromOption(normalized)
      : normalizeQuotePrice(response);

    debug?.({
      level: price !== undefined && price > 0 ? "success" : "warning",
      step: "Prêmio — normalização",
      message:
        price !== undefined && price > 0
          ? `Prêmio reconhecido: ${price}.`
          : "A resposta não continha um prêmio reconhecido.",
      data: {
        optionCode: cleanCode,
        normalizedOption: normalized,
        normalizedPrice: price,
      },
    });

    if (normalized) {
      return {
        lastPrice: getPremiumFromOption(normalized),
        bid: normalized.bid,
        ask: normalized.ask,
        volume: normalized.volume,
        financialVolume: normalized.financialVolume,
        trades: normalized.trades,
        quoteUpdatedAt: normalized.quoteUpdatedAt,
      };
    }

    return price !== undefined && price > 0 ? { lastPrice: price } : undefined;
  } catch (error) {
    debug?.({
      level: "error",
      step: "Prêmio — erro",
      message: `Falha ao buscar o prêmio de ${cleanCode}.`,
      data: errorToDebugData(error),
    });

    console.warn(`Erro ao buscar prêmio de ${cleanCode}:`, error);
    return undefined;
  }
}

async function getSpotPrice(
  underlying: string,
  debug?: DebugLogger
): Promise<number | undefined> {
  const cleanUnderlying = normalizeUnderlying(underlying);

  if (!cleanUnderlying) {
    debug?.({
      level: "warning",
      step: "Cotação do ativo",
      message: "O ativo-objeto ficou vazio; a cotação não foi solicitada.",
    });

    return undefined;
  }

  debug?.({
    level: "info",
    step: "Cotação do ativo",
    message: `Chamando getAssetQuote("${cleanUnderlying}").`,
  });

  try {
    const response = await getAssetQuote(cleanUnderlying);

    debug?.({
      level: "info",
      step: "Cotação do ativo — resposta bruta",
      message: `Resposta recebida para ${cleanUnderlying}.`,
      data: response,
    });

    const price = normalizeQuotePrice(response);

    debug?.({
      level: price !== undefined && price > 0 ? "success" : "warning",
      step: "Cotação do ativo — normalização",
      message:
        price !== undefined && price > 0
          ? `Preço do ativo reconhecido: ${price}.`
          : "A resposta não continha uma cotação reconhecida.",
      data: {
        underlying: cleanUnderlying,
        normalizedPrice: price,
      },
    });

    return price !== undefined && price > 0 ? price : undefined;
  } catch (error) {
    debug?.({
      level: "error",
      step: "Cotação do ativo — erro",
      message: `Falha ao buscar a cotação de ${cleanUnderlying}.`,
      data: errorToDebugData(error),
    });

    console.warn(`Erro ao buscar cotação de ${cleanUnderlying}:`, error);
    return undefined;
  }
}

async function resolveOptionByCode(
  optionCode: string,
  debug?: DebugLogger
): Promise<{
  option: OptionChainItem;
  chain: OptionChainItem[];
  premium?: number;
  spotPrice?: number;
}> {
  const cleanCode = optionCode.trim().toUpperCase();

  debug?.({
    level: "info",
    step: "Início",
    message: `Iniciando resolução da opção ${cleanCode}.`,
  });

  let metadataResponse: unknown;

  try {
    debug?.({
      level: "info",
      step: "Metadados",
      message: `Chamando getOptionBySymbol("${cleanCode}").`,
    });

    metadataResponse = await getOptionBySymbol(cleanCode);

    debug?.({
      level: "info",
      step: "Metadados — resposta bruta",
      message: "Resposta original devolvida pelo serviço.",
      data: metadataResponse,
    });
  } catch (error) {
    debug?.({
      level: "error",
      step: "Metadados — erro",
      message: `getOptionBySymbol falhou para ${cleanCode}.`,
      data: errorToDebugData(error),
    });

    throw error;
  }

  const metadataObject = unwrapObject(metadataResponse);
  const metadata = normalizeOption(metadataObject);

  debug?.({
    level: metadata ? "success" : "warning",
    step: "Metadados — normalização",
    message: metadata
      ? "Metadados normalizados."
      : "A resposta não pôde ser normalizada como uma opção.",
    data: {
      unwrapped: metadataObject,
      normalized: metadata,
    },
  });

  const inferredUnderlying =
    metadata?.underlying || inferUnderlyingFromOptionCode(cleanCode);

  const underlying = normalizeUnderlying(inferredUnderlying);

  debug?.({
    level: underlying ? "success" : "warning",
    step: "Ativo-objeto",
    message: underlying
      ? `Ativo-objeto resolvido como ${underlying}.`
      : "Não foi possível resolver o ativo-objeto.",
    data: {
      metadataUnderlying: metadata?.underlying,
      inferredUnderlying,
      normalizedUnderlying: underlying,
    },
  });

  let chain: OptionChainItem[] = [];
  let chainResponse: unknown;

  if (underlying) {
    try {
      debug?.({
        level: "info",
        step: "Cadeia",
        message: `Chamando getOptionsChain("${underlying}").`,
      });

      chainResponse = await getOptionsChain(underlying);

      debug?.({
        level: "info",
        step: "Cadeia — resposta bruta",
        message: `Resposta original da cadeia de ${underlying}.`,
        data: chainResponse,
      });

      chain = normalizeOptionsPayload(chainResponse);

      debug?.({
        level: chain.length ? "success" : "warning",
        step: "Cadeia — normalização",
        message: `${chain.length} opção(ões) reconhecida(s) após a normalização.`,
        data: {
          total: chain.length,
          firstSymbols: chain.slice(0, 20).map((item) => ({
            symbol: item.symbol,
            strike: item.strike,
            expirationDate: item.expirationDate,
            lastPrice: item.lastPrice,
            bid: item.bid,
            ask: item.ask,
            volume: item.volume,
            trades: item.trades,
          })),
        },
      });
    } catch (error) {
      debug?.({
        level: "error",
        step: "Cadeia — erro",
        message: `Não foi possível carregar a cadeia de ${underlying}.`,
        data: errorToDebugData(error),
      });

      console.warn(
        `Não foi possível carregar a cadeia de ${underlying}:`,
        error
      );
    }
  }

  const chainOption = findOptionInChain(chain, cleanCode);

  debug?.({
    level: chainOption ? "success" : "warning",
    step: "Busca na cadeia",
    message: chainOption
      ? `Contrato ${chainOption.symbol} localizado na cadeia.`
      : `O contrato ${cleanCode} não foi localizado entre as opções normalizadas.`,
    data: {
      searchedCode: cleanCode,
      normalizedSearchedCode: normalizeCode(cleanCode),
      matchedOption: chainOption,
    },
  });

  const chainPremium = chainOption
    ? getPremiumFromOption(chainOption)
    : undefined;
  const metadataPremium = metadata
    ? getPremiumFromOption(metadata)
    : undefined;

  let freshMarketData: FreshOptionData | undefined;
  let freshPremium: number | undefined;

  if (metadataPremium === undefined && chainPremium === undefined) {
    freshMarketData = await getFreshOptionData(cleanCode, debug);
    freshPremium = freshMarketData?.lastPrice;
  } else {
    debug?.({
      level: "success",
      step: "Prêmio — cache da opção",
      message:
        "O prêmio já veio em getOptionBySymbol; nenhuma segunda chamada foi necessária.",
      data: {
        metadataPremium,
        chainPremium,
      },
    });
  }

  const premium =
    metadataPremium ?? chainPremium ?? freshPremium;

  debug?.({
    level: premium !== undefined && premium > 0 ? "success" : "error",
    step: "Prêmio — decisão final",
    message:
      premium !== undefined && premium > 0
        ? `Prêmio escolhido: ${premium}.`
        : "Nenhuma das fontes forneceu um prêmio válido.",
    data: {
      freshPremium,
      chainPremium,
      metadataPremium,
      selectedPremium: premium,
    },
  });

  const chainStrike = chainOption?.strike;
  const metadataStrike = metadata?.strike;
  const strike = chainStrike ?? metadataStrike;

  debug?.({
    level: strike !== undefined && strike > 0 ? "success" : "error",
    step: "Strike — decisão final",
    message:
      strike !== undefined && strike > 0
        ? `Strike escolhido: ${strike}.`
        : "Nenhuma das fontes forneceu um strike válido.",
    data: {
      chainStrike,
      metadataStrike,
      selectedStrike: strike,
      chainOptionRaw: chainOption?.raw,
      metadataRaw: metadataResponse,
    },
  });

  if (strike === undefined || strike <= 0) {
    throw new Error(
      `Não encontrei o strike de ${cleanCode}. Verifique o código da opção e tente novamente.`
    );
  }

  const mergedOption: OptionChainItem = {
    symbol: cleanCode,
    underlying:
      chainOption?.underlying || metadata?.underlying || underlying,
    type:
      chainOption && chainOption.type !== "unknown"
        ? chainOption.type
        : metadata?.type && metadata.type !== "unknown"
        ? metadata.type
        : inferOptionType(cleanCode, metadataObject),
    strike,
    expirationDate:
      chainOption?.expirationDate || metadata?.expirationDate || "",
    lastPrice: premium,
    bid: chainOption?.bid ?? metadata?.bid ?? freshMarketData?.bid,
    ask: chainOption?.ask ?? metadata?.ask ?? freshMarketData?.ask,
    volume: chainOption?.volume ?? metadata?.volume ?? freshMarketData?.volume,
    financialVolume:
      chainOption?.financialVolume ?? metadata?.financialVolume ?? freshMarketData?.financialVolume,
    trades: chainOption?.trades ?? metadata?.trades ?? freshMarketData?.trades,
    quoteUpdatedAt:
      chainOption?.quoteUpdatedAt ?? metadata?.quoteUpdatedAt ?? freshMarketData?.quoteUpdatedAt,
    raw: {
      metadataResponse,
      chainOption: chainOption?.raw,
    },
  };

  debug?.({
    level: "success",
    step: "Opção consolidada",
    message: "Dados finais consolidados antes dos cálculos.",
    data: mergedOption,
  });

  const spotPrice = await getSpotPrice(
    mergedOption.underlying || underlying,
    debug
  );

  debug?.({
    level: "success",
    step: "Resultado da resolução",
    message: `Resolução concluída: ${mergedOption.symbol}, ${mergedOption.type}, strike ${mergedOption.strike}, prêmio ${premium}, ativo ${spotPrice ?? "não encontrado"}.`,
    data: {
      option: mergedOption,
      chainLength: chain.length,
      premium,
      spotPrice,
    },
  });

  return {
    option: mergedOption,
    chain,
    premium,
    spotPrice,
  };
}

function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const density = 0.3989423 * Math.exp((-x * x) / 2);

  let probability =
    1 -
    density *
      t *
      (0.3193815 +
        t *
          (-0.3565638 +
            t *
              (1.781478 + t * (-1.821256 + t * 1.330274))));

  if (x < 0) probability = 1 - probability;

  return probability;
}

function blackScholesPrice(params: {
  optionType: OptionType;
  spot: number;
  strike: number;
  timeToExpiration: number;
  riskFreeRate: number;
  volatility: number;
}): number {
  const {
    optionType,
    spot,
    strike,
    timeToExpiration,
    riskFreeRate,
    volatility,
  } = params;

  if (
    spot <= 0 ||
    strike <= 0 ||
    timeToExpiration <= 0 ||
    volatility <= 0
  ) {
    return 0;
  }

  const sqrtTime = Math.sqrt(timeToExpiration);
  const d1 =
    (Math.log(spot / strike) +
      (riskFreeRate + 0.5 * volatility ** 2) * timeToExpiration) /
    (volatility * sqrtTime);
  const d2 = d1 - volatility * sqrtTime;
  const discountedStrike =
    strike * Math.exp(-riskFreeRate * timeToExpiration);

  if (optionType === "call") {
    return spot * normalCdf(d1) - discountedStrike * normalCdf(d2);
  }

  return discountedStrike * normalCdf(-d2) - spot * normalCdf(-d1);
}

function calculateImpliedVolatility(params: {
  optionType: OptionType;
  spot: number;
  strike: number;
  timeToExpiration: number;
  riskFreeRate: number;
  marketPrice: number;
}): number | null {
  const {
    optionType,
    spot,
    strike,
    timeToExpiration,
    riskFreeRate,
    marketPrice,
  } = params;

  if (
    spot <= 0 ||
    strike <= 0 ||
    timeToExpiration <= 0 ||
    marketPrice <= 0
  ) {
    return null;
  }

  const intrinsic =
    optionType === "call"
      ? Math.max(spot - strike, 0)
      : Math.max(strike - spot, 0);

  if (marketPrice + 0.0001 < intrinsic) return null;

  let lower = 0.0001;
  let upper = 5;

  for (let index = 0; index < 160; index += 1) {
    const middle = (lower + upper) / 2;
    const calculatedPrice = blackScholesPrice({
      optionType,
      spot,
      strike,
      timeToExpiration,
      riskFreeRate,
      volatility: middle,
    });

    if (Math.abs(calculatedPrice - marketPrice) < 0.00001) {
      return middle;
    }

    if (calculatedPrice > marketPrice) {
      upper = middle;
    } else {
      lower = middle;
    }
  }

  const result = (lower + upper) / 2;

  return Number.isFinite(result) ? result : null;
}

function getTimeToExpiration(expirationDate: string): number {
  if (!expirationDate) return 0;

  const expiration = new Date(`${expirationDate}T23:59:59`);
  const now = new Date();

  return Math.max(
    (expiration.getTime() - now.getTime()) /
      (365 * 24 * 60 * 60 * 1000),
    0
  );
}

function calculateSmileOption(
  option: ResolvedOption,
  volatilityPercent: number,
  source: OptionSource
): SmileOption {
  const timeToExpiration = getTimeToExpiration(option.expirationDate);
  const theoreticalPrice = blackScholesPrice({
    optionType: option.optionType,
    spot: option.spotPrice,
    strike: option.strike,
    timeToExpiration,
    riskFreeRate: DEFAULT_RISK_FREE_RATE,
    volatility: volatilityPercent / 100,
  });
  const impliedVolatility = calculateImpliedVolatility({
    optionType: option.optionType,
    spot: option.spotPrice,
    strike: option.strike,
    timeToExpiration,
    riskFreeRate: DEFAULT_RISK_FREE_RATE,
    marketPrice: option.marketPrice,
  });

  return {
    ...option,
    id: crypto.randomUUID(),
    theoreticalPrice,
    impliedVolatility,
    source,
  };
}

function chooseOptionsBySpacing(
  options: OptionChainItem[],
  referenceStrike: number,
  desiredSpacing: number,
  amountBelow: number,
  amountAbove: number
): OptionChainItem[] {
  const ordered = options
    .filter((option) => option.strike !== undefined && option.strike > 0)
    .sort((a, b) => Number(a.strike) - Number(b.strike));
  const selected: OptionChainItem[] = [];
  const usedCodes = new Set<string>();

  const addClosest = (targetStrike: number) => {
    const available = ordered.filter(
      (option) => !usedCodes.has(option.symbol)
    );

    if (!available.length) return;

    const closest = available.reduce((best, current) => {
      const currentDistance = Math.abs(Number(current.strike) - targetStrike);
      const bestDistance = Math.abs(Number(best.strike) - targetStrike);

      return currentDistance < bestDistance ? current : best;
    });

    usedCodes.add(closest.symbol);
    selected.push(closest);
  };

  for (let index = amountBelow; index >= 1; index -= 1) {
    addClosest(referenceStrike - desiredSpacing * index);
  }

  addClosest(referenceStrike);

  for (let index = 1; index <= amountAbove; index += 1) {
    addClosest(referenceStrike + desiredSpacing * index);
  }

  return selected.sort((a, b) => Number(a.strike) - Number(b.strike));
}

function parseOptionSymbolStrikePattern(
  symbol: string,
  strike: number
): { prefix: string; scale: number; suffixLength: number } | null {
  const match = normalizeCode(symbol).match(/^([A-Z]{4}[A-X])(\d+)$/);

  if (!match || strike <= 0) return null;

  const [, prefix, suffix] = match;
  const numericSuffix = Number(suffix);

  if (!Number.isFinite(numericSuffix) || numericSuffix <= 0) return null;

  const scale = numericSuffix / strike;
  const roundedScale = Math.round(scale);

  if (!Number.isFinite(roundedScale) || roundedScale <= 0) return null;

  return {
    prefix,
    scale: roundedScale,
    suffixLength: suffix.length,
  };
}

function buildOptionCodeFromStrike(
  pattern: { prefix: string; scale: number; suffixLength: number },
  strike: number
): string | null {
  if (strike <= 0) return null;

  const scaledStrike = Math.round(strike * pattern.scale);

  if (!Number.isFinite(scaledStrike) || scaledStrike <= 0) return null;

  return `${pattern.prefix}${String(scaledStrike).padStart(
    pattern.suffixLength,
    "0"
  )}`;
}

function buildExpectedOptionCodesBySpacing(
  reference: ResolvedOption,
  desiredSpacing: number,
  amountBelow: number,
  amountAbove: number
): string[] {
  const pattern = parseOptionSymbolStrikePattern(
    reference.optionCode,
    reference.strike
  );

  if (!pattern) return [];

  const codes = new Set<string>();

  for (let index = amountBelow; index >= 1; index -= 1) {
    const code = buildOptionCodeFromStrike(
      pattern,
      reference.strike - desiredSpacing * index
    );

    if (code) codes.add(code);
  }

  const referenceCode = buildOptionCodeFromStrike(pattern, reference.strike);

  if (referenceCode) codes.add(referenceCode);

  for (let index = 1; index <= amountAbove; index += 1) {
    const code = buildOptionCodeFromStrike(
      pattern,
      reference.strike + desiredSpacing * index
    );

    if (code) codes.add(code);
  }

  return Array.from(codes);
}

async function fetchGeneratedChainOptions(
  reference: ResolvedOption,
  desiredSpacing: number,
  amountBelow: number,
  amountAbove: number,
  debug?: DebugLogger
): Promise<OptionChainItem[]> {
  const generatedCodes = buildExpectedOptionCodesBySpacing(
    reference,
    desiredSpacing,
    amountBelow,
    amountAbove
  ).filter(
    (code) => normalizeCode(code) !== normalizeCode(reference.optionCode)
  );

  if (!generatedCodes.length) return [];

  debug?.({
    level: "info",
    step: "Curva — fallback por código",
    message: `Tentando buscar ${generatedCodes.length} contrato(s) estimado(s) pela série e espaçamento.`,
    data: { generatedCodes },
  });

  const fetched = await Promise.all(
    generatedCodes.map(async (code): Promise<OptionChainItem | null> => {
      try {
        const response = await getOptionBySymbol(code);
        const normalized = normalizeOption(unwrapObject(response));

        if (!normalized) return null;

        const optionType =
          normalized.type === "unknown"
            ? inferOptionType(normalized.symbol)
            : normalized.type;

        if (optionType !== reference.optionType) return null;

        if (
          normalized.expirationDate &&
          reference.expirationDate &&
          normalized.expirationDate !== reference.expirationDate
        ) {
          return null;
        }

        return {
          ...normalized,
          underlying: normalized.underlying || reference.underlying,
          type: optionType,
          expirationDate: normalized.expirationDate || reference.expirationDate,
        };
      } catch (error) {
        debug?.({
          level: "warning",
          step: "Curva — fallback por código",
          message: `Não foi possível buscar ${code}.`,
          data: errorToDebugData(error),
        });

        return null;
      }
    })
  );

  const valid = fetched.filter((option): option is OptionChainItem =>
    Boolean(option)
  );

  debug?.({
    level: valid.length ? "success" : "warning",
    step: "Curva — fallback por código",
    message: `${valid.length} contrato(s) estimado(s) foram encontrados pela busca direta.`,
    data: {
      generatedCodes,
      foundSymbols: valid.map((option) => option.symbol),
    },
  });

  return valid;
}

function optionToDraft(
  option: OptionChainItem,
  premium: number | undefined,
  spotPrice?: number
): OptionDraft {
  const type =
    option.type === "put"
      ? "put"
      : option.type === "call"
      ? "call"
      : inferOptionType(option.symbol) === "put"
      ? "put"
      : "call";

  return {
    optionCode: option.symbol,
    underlying:
      normalizeUnderlying(option.underlying) ||
      inferUnderlyingFromOptionCode(option.symbol),
    optionType: type,
    strike: toInputNumber(option.strike),
    expirationDate: option.expirationDate || "",
    marketPrice: toInputNumber(premium),
    spotPrice: toInputNumber(spotPrice),
    bid: option.bid,
    ask: option.ask,
    volume: option.volume,
    financialVolume: option.financialVolume,
    trades: option.trades,
    quoteUpdatedAt: option.quoteUpdatedAt,
  };
}

function draftToResolvedOption(draft: OptionDraft): ResolvedOption {
  const strike = toNumber(draft.strike) || 0;
  const marketPrice = toNumber(draft.marketPrice) || 0;
  const spotPrice = toNumber(draft.spotPrice) || 0;

  if (strike <= 0) {
    throw new Error("O strike é obrigatório.");
  }

  if (marketPrice <= 0) {
    throw new Error("O prêmio de mercado é obrigatório.");
  }

  if (spotPrice <= 0) {
    throw new Error(
      "Não encontrei o preço do ativo. Preencha o preço atual para calcular."
    );
  }

  if (!draft.expirationDate) {
    throw new Error(
      "Não encontrei o vencimento. Preencha a data para calcular."
    );
  }

  return {
    optionCode: draft.optionCode.trim().toUpperCase(),
    underlying: normalizeUnderlying(draft.underlying),
    optionType: draft.optionType,
    strike,
    expirationDate: draft.expirationDate,
    marketPrice,
    spotPrice,
    bid: draft.bid,
    ask: draft.ask,
    volume: draft.volume,
    financialVolume: draft.financialVolume,
    trades: draft.trades,
    quoteUpdatedAt: draft.quoteUpdatedAt,
  };
}

function formatNumber(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";

  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";

  return `${(value * 100).toFixed(2)}%`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatOptionalCurrency(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : formatCurrency(value);
}

function formatOptionalNumber(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : formatNumber(value);
}

function calculateSpreadData(
  bid?: number,
  ask?: number
): { spread: number | null; spreadPercent: number | null } {
  if (
    bid === undefined ||
    ask === undefined ||
    !Number.isFinite(bid) ||
    !Number.isFinite(ask) ||
    bid <= 0 ||
    ask <= 0 ||
    ask < bid
  ) {
    return { spread: null, spreadPercent: null };
  }

  const spread = ask - bid;
  const midpoint = (ask + bid) / 2;

  return {
    spread,
    spreadPercent: midpoint > 0 ? (spread / midpoint) * 100 : null,
  };
}

function uniqueSmileOptions(options: SmileOption[]): SmileOption[] {
  const map = new Map<string, SmileOption>();

  for (const option of options) {
    map.set(option.optionCode, option);
  }

  return Array.from(map.values()).sort((a, b) => a.strike - b.strike);
}

export default function VolatilitySmilePage() {
  const [referenceCode, setReferenceCode] = useState("");
  const [desiredSpacing, setDesiredSpacing] = useState("0,50");
  const [strikesBelow, setStrikesBelow] = useState("5");
  const [strikesAbove, setStrikesAbove] = useState("5");
  const [baseVolatility, setBaseVolatility] = useState("30");

  const [referenceDraft, setReferenceDraft] =
    useState<OptionDraft | null>(null);
  const [referenceChain, setReferenceChain] = useState<OptionChainItem[]>([]);

  const [showManual, setShowManual] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [manualDraft, setManualDraft] = useState<OptionDraft | null>(null);

  const [options, setOptions] = useState<SmileOption[]>([]);
  const [loadingReference, setLoadingReference] = useState(false);
  const [loadingManual, setLoadingManual] = useState(false);
  const [loadingCurve, setLoadingCurve] = useState(false);
  const [loadingLiquidity, setLoadingLiquidity] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const addDebug: DebugLogger = () => undefined;

  const volatility = Math.max(toNumber(baseVolatility) || 0, 0);

  const buildCurve = async (
    reference: ResolvedOption,
    availableChain: OptionChainItem[]
  ) => {
    setLoadingCurve(true);
    setError("");
    setNotice("");

    try {
      const referenceContract: OptionChainItem = {
        symbol: reference.optionCode,
        underlying: reference.underlying,
        type: reference.optionType,
        strike: reference.strike,
        expirationDate: reference.expirationDate,
        lastPrice: reference.marketPrice,
        bid: reference.bid,
        ask: reference.ask,
        volume: reference.volume,
        financialVolume: reference.financialVolume,
        trades: reference.trades,
        quoteUpdatedAt: reference.quoteUpdatedAt,
        raw: reference,
      };

      const spacing = Math.max(toNumber(desiredSpacing) || 0.5, 0.01);
      const amountBelow = Math.max(Math.floor(toNumber(strikesBelow) || 0), 0);
      const amountAbove = Math.max(Math.floor(toNumber(strikesAbove) || 0), 0);
      const compatibleChain = availableChain.filter((option) => {
        const type =
          option.type === "unknown"
            ? inferOptionType(option.symbol)
            : option.type;

        if (type !== reference.optionType) return false;

        if (!option.expirationDate) return true;

        return option.expirationDate === reference.expirationDate;
      });

      const fallbackChain =
        compatibleChain.length > 1
          ? []
          : await fetchGeneratedChainOptions(
              reference,
              spacing,
              amountBelow,
              amountAbove,
              addDebug
            );

      const expandedCompatibleChain = uniqueOptionChainItems([
        ...compatibleChain,
        ...fallbackChain,
      ]);

      addDebug({
        level: expandedCompatibleChain.length ? "success" : "warning",
        step: "Curva — contratos compatíveis",
        message: expandedCompatibleChain.length
          ? `${expandedCompatibleChain.length} contrato(s) do mesmo tipo e vencimento foram encontrados.`
          : "A cadeia e a busca direta não trouxeram outros contratos do mesmo vencimento. A opção de referência será calculada sozinha.",
        data: {
          reference: referenceContract,
          chainSymbols: compatibleChain.map((option) => option.symbol),
          fallbackSymbols: fallbackChain.map((option) => option.symbol),
          compatibleSymbols: expandedCompatibleChain.map((option) => ({
            symbol: option.symbol,
            strike: option.strike,
            expirationDate: option.expirationDate,
          })),
        },
      });

      const candidateMap = new Map<string, OptionChainItem>();

      for (const option of expandedCompatibleChain) {
        candidateMap.set(normalizeCode(option.symbol), option);
      }

      candidateMap.set(
        normalizeCode(referenceContract.symbol),
        referenceContract
      );

      const candidates = Array.from(candidateMap.values());

      const selected =
        candidates.length === 1
          ? candidates
          : chooseOptionsBySpacing(
              candidates,
              reference.strike,
              spacing,
              amountBelow,
              amountAbove
            );

      const calculated = await Promise.all(
        selected.map(async (chainOption) => {
          const isReference =
            normalizeCode(chainOption.symbol) ===
            normalizeCode(reference.optionCode);

          const freshMarketData = isReference
            ? undefined
            : await getFreshOptionData(chainOption.symbol, addDebug);
          const marketData = freshMarketData;

          const marketPrice =
            (isReference ? reference.marketPrice : undefined) ??
            marketData?.lastPrice ??
            getPremiumFromOption(chainOption) ??
            0;

          const resolved: ResolvedOption = {
            optionCode: chainOption.symbol,
            underlying:
              chainOption.underlying || reference.underlying,
            optionType:
              chainOption.type === "unknown"
                ? reference.optionType
                : chainOption.type,
            strike: chainOption.strike || 0,
            expirationDate:
              chainOption.expirationDate ||
              reference.expirationDate,
            marketPrice,
            spotPrice: reference.spotPrice,
            bid: marketData?.bid ?? chainOption.bid ?? (isReference ? reference.bid : undefined),
            ask: marketData?.ask ?? chainOption.ask ?? (isReference ? reference.ask : undefined),
            volume: marketData?.volume ?? chainOption.volume ?? (isReference ? reference.volume : undefined),
            financialVolume:
              marketData?.financialVolume ??
              chainOption.financialVolume ??
              (isReference ? reference.financialVolume : undefined),
            trades: marketData?.trades ?? chainOption.trades ?? (isReference ? reference.trades : undefined),
            quoteUpdatedAt:
              marketData?.quoteUpdatedAt ??
              chainOption.quoteUpdatedAt ??
              (isReference ? reference.quoteUpdatedAt : undefined),
          };

          return calculateSmileOption(
            resolved,
            volatility,
            "automatic"
          );
        })
      );

      const valid = calculated.filter(
        (option) =>
          option.strike > 0 &&
          option.marketPrice > 0
      );

      if (!valid.length) {
        throw new Error(
          "Não encontrei dados válidos para calcular nenhuma opção."
        );
      }

      setOptions(uniqueSmileOptions(valid));

      if (!expandedCompatibleChain.length) {
        setNotice(
          `A opção ${reference.optionCode} foi calculada, mas não encontrei outras opções de ${formatDisplayDate(
            reference.expirationDate
          )} na cadeia nem pela busca automática por códigos próximos. Você pode adicioná-las pelo código na inclusão manual.`
        );
      } else if (!compatibleChain.length && fallbackChain.length) {
        setNotice(
          `A cadeia da API não retornou o vencimento ${formatDisplayDate(
            reference.expirationDate
          )}, então busquei automaticamente opções próximas pelo código da série.`
        );
      } else if (valid.length < selected.length) {
        setNotice(
          `${
            selected.length - valid.length
          } opção(ões) foram ignoradas porque não tinham prêmio de mercado válido.`
        );
      }
    } finally {
      setLoadingCurve(false);
    }
  };

  const handleSearchReference = async (event: FormEvent) => {
    event.preventDefault();

    const code = referenceCode.trim().toUpperCase();

    if (!code) {
      setError("Digite o código da opção de referência.");
      return;
    }

    setLoadingReference(true);
    setError("");
    setNotice("");
    setReferenceDraft(null);

    addDebug({
      level: "info",
      step: "Entrada do usuário",
      message: "Busca automática iniciada.",
      data: {
        code,
        desiredSpacing,
        strikesBelow,
        strikesAbove,
        baseVolatility,
      },
    });

    try {
      const result = await resolveOptionByCode(code, addDebug);
      const draft = optionToDraft(
        result.option,
        result.premium,
        result.spotPrice
      );

      setReferenceDraft(draft);
      setReferenceChain(result.chain);

      const missing: string[] = [];

      if (!draft.expirationDate) missing.push("vencimento");
      if (!draft.spotPrice) missing.push("preço do ativo");
      if (!draft.underlying) missing.push("ativo-objeto");

      if (missing.length) {
        setNotice(
          `Strike e prêmio encontrados. Preencha ${missing.join(
            " e "
          )} para continuar.`
        );
        return;
      }

      const reference = draftToResolvedOption(draft);
      await buildCurve(reference, result.chain);
    } catch (caughtError) {
      addDebug({
        level: "error",
        step: "Busca automática — erro final",
        message: "A busca automática foi interrompida.",
        data: errorToDebugData(caughtError),
      });

        setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível buscar a opção de referência."
      );
    } finally {
      setLoadingReference(false);
    }
  };

  const handleContinueCurve = async () => {
    if (!referenceDraft) return;

    try {
      const reference = draftToResolvedOption(referenceDraft);
      await buildCurve(reference, referenceChain);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível gerar a curva."
      );
    }
  };

  const handleSearchManual = async (event: FormEvent) => {
    event.preventDefault();

    const code = manualCode.trim().toUpperCase();

    if (!code) {
      setError("Digite o código da opção.");
      return;
    }

    setLoadingManual(true);
    setError("");
    setNotice("");
    setManualDraft(null);

    addDebug({
      level: "info",
      step: "Entrada do usuário",
      message: "Busca manual iniciada.",
      data: { code, baseVolatility },
    });

    try {
      const result = await resolveOptionByCode(code, addDebug);
      const draft = optionToDraft(
        result.option,
        result.premium,
        result.spotPrice
      );

      setManualDraft(draft);

      const missing: string[] = [];

      if (!draft.expirationDate) missing.push("vencimento");
      if (!draft.spotPrice) missing.push("preço do ativo");
      if (!draft.underlying) missing.push("ativo-objeto");

      if (missing.length) {
        setNotice(
          `Strike e prêmio encontrados. Preencha ${missing.join(
            " e "
          )} antes de calcular.`
        );
      }
    } catch (caughtError) {
      addDebug({
        level: "error",
        step: "Busca manual — erro final",
        message: "A busca manual foi interrompida.",
        data: errorToDebugData(caughtError),
      });

        setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível buscar a opção."
      );
    } finally {
      setLoadingManual(false);
    }
  };

  const handleAddManual = () => {
    if (!manualDraft) return;

    try {
      const resolved = draftToResolvedOption(manualDraft);
      const calculated = calculateSmileOption(
        resolved,
        volatility,
        "manual"
      );

      setOptions((current) =>
        uniqueSmileOptions([...current, calculated])
      );
      setManualCode("");
      setManualDraft(null);
      setError("");
      setNotice("");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível calcular a opção."
      );
    }
  };

  const handleMarketPriceChange = (
    optionId: string,
    value: string
  ) => {
    const marketPrice = toNumber(value);

    if (marketPrice === undefined || marketPrice <= 0) {
      return;
    }

    setOptions((current) =>
      current.map((option) => {
        if (option.id !== optionId) {
          return option;
        }

        const recalculated = calculateSmileOption(
          {
            optionCode: option.optionCode,
            underlying: option.underlying,
            optionType: option.optionType,
            strike: option.strike,
            expirationDate: option.expirationDate,
            marketPrice,
            spotPrice: option.spotPrice,
            bid: option.bid,
            ask: option.ask,
            volume: option.volume,
            financialVolume: option.financialVolume,
            trades: option.trades,
            quoteUpdatedAt: option.quoteUpdatedAt,
          },
          volatility,
          option.source
        );

        return {
          ...recalculated,
          id: option.id,
        };
      })
    );
  };

  const handleRecalculate = () => {
    setOptions((current) =>
      current.map((option) => {
        const recalculated = calculateSmileOption(
          {
            optionCode: option.optionCode,
            underlying: option.underlying,
            optionType: option.optionType,
            strike: option.strike,
            expirationDate: option.expirationDate,
            marketPrice: option.marketPrice,
            spotPrice: option.spotPrice,
            bid: option.bid,
            ask: option.ask,
            volume: option.volume,
            financialVolume: option.financialVolume,
            trades: option.trades,
            quoteUpdatedAt: option.quoteUpdatedAt,
          },
          volatility,
          option.source
        );

        return {
          ...recalculated,
          id: option.id,
        };
      })
    );
  };

  const handleRefreshLiquidity = async () => {
    if (!options.length) return;

    setLoadingLiquidity(true);
    setError("");
    setNotice("");

    try {
      const refreshed = await Promise.all(
        options.map(async (option) => {
          const freshData = await getFreshOptionData(option.optionCode);

          return {
            ...option,
            bid: freshData?.bid ?? option.bid,
            ask: freshData?.ask ?? option.ask,
            volume: freshData?.volume ?? option.volume,
            financialVolume:
              freshData?.financialVolume ?? option.financialVolume,
            trades: freshData?.trades ?? option.trades,
            quoteUpdatedAt:
              freshData?.quoteUpdatedAt ?? option.quoteUpdatedAt,
          };
        })
      );

      setOptions(refreshed);

      const volumeCoverage = refreshed.filter(
        (option) => option.volume !== undefined
      ).length;
      const tradesCoverage = refreshed.filter(
        (option) => option.trades !== undefined
      ).length;
      const bidAskCoverage = refreshed.filter(
        (option) => option.bid !== undefined && option.ask !== undefined
      ).length;

      setNotice(
        `Liquidez atualizada. Volume: ${volumeCoverage}/${refreshed.length}; negócios: ${tradesCoverage}/${refreshed.length}; bid/ask: ${bidAskCoverage}/${refreshed.length}.`
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível atualizar a liquidez."
      );
    } finally {
      setLoadingLiquidity(false);
    }
  };

  const chartData = useMemo<SmileChartItem[]>(
    () =>
      options.map((option) => {
        const bid = option.bid ?? null;
        const ask = option.ask ?? null;
        const volume = option.volume ?? null;
        const trades = option.trades ?? null;
        const { spread, spreadPercent } = calculateSpreadData(
          option.bid,
          option.ask
        );

        return {
          strike: option.strike,
          optionCode: option.optionCode,
          impliedVolatility:
            option.impliedVolatility === null
              ? null
              : option.impliedVolatility * 100,
          marketPrice: option.marketPrice,
          theoreticalPrice: option.theoreticalPrice,
          bid,
          ask,
          spread,
          spreadPercent,
          volume,
          trades,
          averageVolumePerTrade:
            volume !== null && trades !== null && trades > 0
              ? volume / trades
              : null,
          financialVolume: option.financialVolume ?? null,
          quoteUpdatedAt: option.quoteUpdatedAt ?? null,
        };
      }),
    [options]
  );

  const volatilityChartData = useMemo(
    () => chartData.filter((item) => item.impliedVolatility !== null),
    [chartData]
  );
  const liquidityChartData = useMemo(
    () =>
      chartData.filter(
        (item) => item.volume !== null || item.trades !== null
      ),
    [chartData]
  );
  const spreadChartData = useMemo(
    () => chartData.filter((item) => item.spreadPercent !== null),
    [chartData]
  );
  const curveSpotPrice = options[0]?.spotPrice;
  const liquiditySummary = useMemo(() => {
    const total = chartData.length;
    const totalVolume = chartData.reduce(
      (sum, item) => sum + (item.volume ?? 0),
      0
    );
    const totalTrades = chartData.reduce(
      (sum, item) => sum + (item.trades ?? 0),
      0
    );
    const maxVolume = chartData.reduce<SmileChartItem | null>(
      (best, item) =>
        item.volume !== null && (!best || item.volume > (best.volume ?? -1))
          ? item
          : best,
      null
    );
    const maxTrades = chartData.reduce<SmileChartItem | null>(
      (best, item) =>
        item.trades !== null && (!best || item.trades > (best.trades ?? -1))
          ? item
          : best,
      null
    );

    return {
      total,
      totalVolume,
      totalTrades,
      averageVolumePerTrade:
        totalTrades > 0 ? totalVolume / totalTrades : null,
      maxVolume,
      maxTrades,
      volumeCoverage: chartData.filter((item) => item.volume !== null).length,
      tradesCoverage: chartData.filter((item) => item.trades !== null).length,
      bidAskCoverage: chartData.filter(
        (item) => item.bid !== null && item.ask !== null
      ).length,
    };
  }, [chartData]);

  const styles: Record<string, CSSProperties> = {
    page: {
      padding: 28,
      display: "flex",
      flexDirection: "column",
      gap: 16,
      color: "#f8fafc",
    },
    header: {
      margin: 0,
      color: "#f8fafc",
      fontSize: 28,
    },
    subtitle: {
      margin: "6px 0 0",
      color: "#93c5fd",
    },
    card: {
      background: "#ffffff",
      color: "#111827",
      border: "1px solid #cbd5e1",
      borderRadius: 12,
      padding: 16,
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
      gap: 10,
    },
    label: {
      display: "flex",
      flexDirection: "column",
      gap: 5,
      color: "#334155",
      fontSize: 12,
      fontWeight: 700,
    },
    input: {
      boxSizing: "border-box",
      width: "100%",
      minHeight: 38,
      border: "1px solid #cbd5e1",
      borderRadius: 7,
      padding: "8px 10px",
      background: "#ffffff",
      color: "#111827",
      WebkitTextFillColor: "#111827",
      caretColor: "#111827",
      fontSize: 14,
    },
    readonly: {
      boxSizing: "border-box",
      width: "100%",
      minHeight: 38,
      border: "1px solid #cbd5e1",
      borderRadius: 7,
      padding: "8px 10px",
      background: "#f1f5f9",
      color: "#0f172a",
      WebkitTextFillColor: "#0f172a",
      fontSize: 14,
    },
    primaryButton: {
      border: 0,
      borderRadius: 7,
      padding: "10px 14px",
      background: "#2563eb",
      color: "#ffffff",
      fontWeight: 700,
      cursor: "pointer",
    },
    secondaryButton: {
      border: "1px solid #cbd5e1",
      borderRadius: 7,
      padding: "10px 14px",
      background: "#ffffff",
      color: "#111827",
      fontWeight: 700,
      cursor: "pointer",
    },
  };

  const renderDraftFields = (
    draft: OptionDraft,
    setDraft: React.Dispatch<React.SetStateAction<OptionDraft | null>>
  ) => (
    <div style={{ ...styles.grid, marginTop: 14 }}>
      <label style={styles.label}>
        Código
        <input style={styles.readonly} value={draft.optionCode} readOnly />
      </label>

      <label style={styles.label}>
        Strike encontrado
        <input style={styles.readonly} value={draft.strike} readOnly />
      </label>

      <label style={styles.label}>
        Prêmio de mercado (editável)
        <input
          style={styles.input}
          inputMode="decimal"
          value={draft.marketPrice}
          onChange={(event) =>
            setDraft((current) =>
              current
                ? {
                    ...current,
                    marketPrice: event.target.value,
                  }
                : current
            )
          }
          placeholder="Ex.: 0,44"
        />
      </label>

      <label style={styles.label}>
        Ativo-objeto
        <input
          style={styles.input}
          value={draft.underlying}
          onChange={(event) =>
            setDraft((current) =>
              current
                ? {
                    ...current,
                    underlying: event.target.value.toUpperCase(),
                  }
                : current
            )
          }
          placeholder="Ex.: PETR4"
        />
      </label>

      <label style={styles.label}>
        Tipo
        <select
          style={styles.input}
          value={draft.optionType}
          onChange={(event) =>
            setDraft((current) =>
              current
                ? {
                    ...current,
                    optionType: event.target.value as OptionType,
                  }
                : current
            )
          }
        >
          <option value="call">Call</option>
          <option value="put">Put</option>
        </select>
      </label>

      <label style={styles.label}>
        Vencimento
        <input
          style={styles.input}
          type="date"
          value={draft.expirationDate}
          onChange={(event) =>
            setDraft((current) =>
              current
                ? { ...current, expirationDate: event.target.value }
                : current
            )
          }
        />
      </label>

      <label style={styles.label}>
        Preço atual do ativo
        <input
          style={styles.input}
          inputMode="decimal"
          value={draft.spotPrice}
          onChange={(event) =>
            setDraft((current) =>
              current
                ? { ...current, spotPrice: event.target.value }
                : current
            )
          }
          placeholder="Ex.: 38,50"
        />
      </label>
    </div>
  );

  return (
    <Layout>
      <main style={styles.page}>
        <header>
          <h1 style={styles.header}>Sorriso de Volatilidade</h1>
          <p style={styles.subtitle}>
            O sistema busca primeiro o strike e o prêmio. Os demais dados podem
            ser completados manualmente quando a API não retornar.
          </p>
        </header>

        <section style={styles.card}>
          <h2 style={{ margin: "0 0 12px" }}>Gerar automaticamente</h2>

          <form onSubmit={handleSearchReference}>
            <div style={styles.grid}>
              <label style={styles.label}>
                Código da opção de referência
                <input
                  style={styles.input}
                  value={referenceCode}
                  onChange={(event) =>
                    setReferenceCode(event.target.value.toUpperCase())
                  }
                  placeholder="Ex.: PETRG424"
                />
              </label>

              <label style={styles.label}>
                Espaçamento desejado
                <input
                  style={styles.input}
                  inputMode="decimal"
                  value={desiredSpacing}
                  onChange={(event) => setDesiredSpacing(event.target.value)}
                />
              </label>

              <label style={styles.label}>
                Strikes abaixo
                <input
                  style={styles.input}
                  type="number"
                  min="0"
                  value={strikesBelow}
                  onChange={(event) => setStrikesBelow(event.target.value)}
                />
              </label>

              <label style={styles.label}>
                Strikes acima
                <input
                  style={styles.input}
                  type="number"
                  min="0"
                  value={strikesAbove}
                  onChange={(event) => setStrikesAbove(event.target.value)}
                />
              </label>

              <label style={styles.label}>
                Volatilidade-base (%)
                <input
                  style={styles.input}
                  inputMode="decimal"
                  value={baseVolatility}
                  onChange={(event) => setBaseVolatility(event.target.value)}
                />
              </label>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 12,
              }}
            >
              <button
                type="submit"
                style={styles.primaryButton}
                disabled={loadingReference || loadingCurve}
              >
                {loadingReference || loadingCurve
                  ? "Buscando..."
                  : "Gerar sorriso"}
              </button>

              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => {
                  setShowManual((current) => !current);
                  setError("");
                  setNotice("");
                }}
              >
                {showManual
                  ? "Fechar inclusão manual"
                  : "Adicionar opção manualmente"}
              </button>

              <button
                type="button"
                style={{
                  ...styles.secondaryButton,
                  opacity: options.length ? 1 : 0.5,
                }}
                disabled={!options.length}
                onClick={handleRecalculate}
              >
                Recalcular
              </button>

              <button
                type="button"
                style={{
                  ...styles.secondaryButton,
                  opacity: options.length && !loadingLiquidity ? 1 : 0.5,
                }}
                disabled={!options.length || loadingLiquidity}
                onClick={handleRefreshLiquidity}
              >
                {loadingLiquidity ? "Atualizando..." : "Atualizar liquidez"}
              </button>
            </div>
          </form>

          {referenceDraft &&
            renderDraftFields(referenceDraft, setReferenceDraft)}

          {referenceDraft && (
            <button
              type="button"
              style={{ ...styles.primaryButton, marginTop: 12 }}
              onClick={handleContinueCurve}
              disabled={loadingCurve}
            >
              {loadingCurve ? "Montando curva..." : "Continuar e montar curva"}
            </button>
          )}
        </section>

        {showManual && (
          <section style={styles.card}>
            <h2 style={{ margin: "0 0 12px" }}>
              Adicionar opção pelo código
            </h2>

            <form
              onSubmit={handleSearchManual}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(220px, 1fr) auto",
                gap: 8,
                alignItems: "end",
              }}
            >
              <label style={styles.label}>
                Código da opção
                <input
                  style={styles.input}
                  value={manualCode}
                  onChange={(event) =>
                    setManualCode(event.target.value.toUpperCase())
                  }
                  placeholder="Ex.: PETRG424"
                />
              </label>

              <button
                type="submit"
                style={styles.primaryButton}
                disabled={loadingManual}
              >
                {loadingManual ? "Buscando..." : "Buscar opção"}
              </button>
            </form>

            {manualDraft && renderDraftFields(manualDraft, setManualDraft)}

            {manualDraft && (
              <button
                type="button"
                style={{ ...styles.primaryButton, marginTop: 12 }}
                onClick={handleAddManual}
              >
                Calcular e adicionar ao gráfico
              </button>
            )}
          </section>
        )}

        {notice && (
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              background: "#dbeafe",
              border: "1px solid #93c5fd",
              color: "#1e40af",
            }}
          >
            {notice}
          </div>
        )}

        {error && (
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              background: "#fee2e2",
              border: "1px solid #fecaca",
              color: "#b91c1c",
            }}
          >
            {error}
          </div>
        )}

        <section style={styles.card}>
          <h2 style={{ margin: "0 0 10px" }}>
            Curva de volatilidade implícita
          </h2>

          <div style={{ width: "100%", height: 350 }}>
            <ResponsiveContainer>
              <LineChart
                data={volatilityChartData}
                margin={{ top: 10, right: 24, left: 10, bottom: 15 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="strike"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(value) => Number(value).toFixed(2)}
                />
                <YAxis
                  tickFormatter={(value) => `${Number(value).toFixed(1)}%`}
                />
                <Tooltip
                  labelFormatter={(value, payload) => {
                    const code = payload?.[0]?.payload?.optionCode || "";

                    return `${code} — Strike ${Number(value).toFixed(2)}`;
                  }}
                  formatter={(value) => [
                    `${Number(value).toFixed(2)}%`,
                    "Volatilidade implícita",
                  ]}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="impliedVolatility"
                  name="Volatilidade implícita"
                  strokeWidth={2}
                  dot={{ r: 5 }}
                  activeDot={{ r: 7 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section style={styles.card}>
          <h2 style={{ margin: "0 0 10px" }}>
            Preço de mercado × preço teórico
          </h2>

          <div style={{ width: "100%", height: 330 }}>
            <ResponsiveContainer>
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 24, left: 10, bottom: 15 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="strike"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(value) => Number(value).toFixed(2)}
                />
                <YAxis
                  tickFormatter={(value) => `R$ ${Number(value).toFixed(2)}`}
                />
                <Tooltip
                  labelFormatter={(value, payload) => {
                    const code = payload?.[0]?.payload?.optionCode || "";

                    return `${code} — Strike ${Number(value).toFixed(2)}`;
                  }}
                  formatter={(value, name) => [
                    formatCurrency(Number(value)),
                    String(name),
                  ]}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="marketPrice"
                  name="Preço de mercado"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="theoreticalPrice"
                  name="Preço teórico"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section style={styles.card}>
          <h2 style={{ margin: "0 0 10px" }}>Resumo de liquidez</h2>
          <div style={styles.grid}>
            {[
              ["Volume total", formatOptionalNumber(liquiditySummary.totalVolume)],
              ["Total de negócios", formatOptionalNumber(liquiditySummary.totalTrades)],
              ["Média por negócio", formatOptionalNumber(liquiditySummary.averageVolumePerTrade)],
              ["Maior volume", liquiditySummary.maxVolume ? `${liquiditySummary.maxVolume.optionCode} (${formatOptionalNumber(liquiditySummary.maxVolume.volume)})` : "—"],
              ["Mais negócios", liquiditySummary.maxTrades ? `${liquiditySummary.maxTrades.optionCode} (${formatOptionalNumber(liquiditySummary.maxTrades.trades)})` : "—"],
              ["Cobertura de volume", `${liquiditySummary.volumeCoverage}/${liquiditySummary.total}`],
              ["Cobertura de negócios", `${liquiditySummary.tradesCoverage}/${liquiditySummary.total}`],
              ["Cobertura de bid/ask", `${liquiditySummary.bidAskCoverage}/${liquiditySummary.total}`],
            ].map(([label, value]) => (
              <div key={label} style={{ padding: 10, border: "1px solid #e2e8f0", borderRadius: 8 }}>
                <div style={{ color: "#64748b", fontSize: 12, fontWeight: 700 }}>{label}</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{value}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={styles.card}>
          <h2 style={{ margin: "0 0 10px" }}>Atividade e liquidez por strike</h2>
          {liquidityChartData.length ? (
            <div style={{ width: "100%", height: 330 }}>
              <ResponsiveContainer>
                <ComposedChart data={liquidityChartData} margin={{ top: 10, right: 24, left: 10, bottom: 15 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="strike" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(value) => Number(value).toFixed(2)} />
                  <YAxis yAxisId="volume" orientation="left" allowDecimals={false} />
                  <YAxis yAxisId="trades" orientation="right" allowDecimals={false} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const item = payload[0].payload as SmileChartItem;
                    return <div style={{ background: "#fff", border: "1px solid #cbd5e1", padding: 10, color: "#111827" }}>
                      <div><strong>{item.optionCode}</strong></div>
                      <div>Strike: {formatCurrency(item.strike)}</div>
                      <div>Volume: {formatOptionalNumber(item.volume)}</div>
                      <div>Quantidade de negócios: {formatOptionalNumber(item.trades)}</div>
                      <div>Média por negócio: {formatOptionalNumber(item.averageVolumePerTrade)}</div>
                      <div>Último preço: {formatCurrency(item.marketPrice)}</div>
                      <div>Bid: {formatOptionalCurrency(item.bid)}</div>
                      <div>Ask: {formatOptionalCurrency(item.ask)}</div>
                      <div>Spread: {formatOptionalCurrency(item.spread)}</div>
                      <div>Spread percentual: {item.spreadPercent === null ? "—" : `${item.spreadPercent.toFixed(2)}%`}</div>
                      <div>Volume financeiro: {formatOptionalCurrency(item.financialVolume)}</div>
                      <div>Última atualização: {formatDateTime(item.quoteUpdatedAt)}</div>
                    </div>;
                  }} />
                  <Legend />
                  <Bar yAxisId="volume" dataKey="volume" name="Volume negociado" barSize={40} />
                  {liquidityChartData.some((item) => item.trades !== null) && (
                    <Line yAxisId="trades" type="monotone" dataKey="trades" name="Quantidade de negócios" strokeWidth={2} dot={{ r: 4 }} connectNulls={false} />
                  )}
                  {curveSpotPrice !== undefined && <ReferenceLine x={curveSpotPrice} yAxisId="volume" strokeDasharray="5 5" label={`Ativo ${curveSpotPrice.toFixed(2)}`} />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p style={{ color: "#64748b" }}>A API não retornou volume ou quantidade de negócios para os contratos exibidos.</p>
          )}
        </section>

        <section style={styles.card}>
          <h2 style={{ margin: "0 0 10px" }}>Spread do book por strike</h2>
          {spreadChartData.length ? (
            <div style={{ width: "100%", height: 330 }}>
              <ResponsiveContainer>
                <LineChart data={spreadChartData} margin={{ top: 10, right: 24, left: 10, bottom: 15 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="strike" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(value) => Number(value).toFixed(2)} />
                  <YAxis tickFormatter={(value) => `${Number(value).toFixed(2)}%`} />
                  <Tooltip formatter={(value) => [`${Number(value).toFixed(2)}%`, "Spread percentual"]} labelFormatter={(value, payload) => `${payload?.[0]?.payload?.optionCode || ""} — Strike ${Number(value).toFixed(2)}`} />
                  <Legend />
                  <Line type="monotone" dataKey="spreadPercent" name="Spread percentual" strokeWidth={2} dot={{ r: 4 }} connectNulls={false} />
                  {curveSpotPrice !== undefined && <ReferenceLine x={curveSpotPrice} strokeDasharray="5 5" label={`Ativo ${curveSpotPrice.toFixed(2)}`} />}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p style={{ color: "#64748b" }}>A API não retornou bid e ask suficientes para calcular o spread.</p>
          )}
        </section>

        <section style={styles.card}>
          <h2 style={{ margin: "0 0 4px" }}>Opções analisadas</h2>
          <p
            style={{
              margin: "0 0 12px",
              color: "#64748b",
              fontSize: 13,
            }}
          >
            Altere o preço de mercado diretamente na tabela. A volatilidade
            implícita e os gráficos são recalculados automaticamente.
          </p>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                minWidth: 1680,
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr>
                  {[
                    "Código",
                    "Tipo",
                    "Strike",
                    "Mercado (editável)",
                    "Teórico",
                    "Diferença",
                    "IV",
                    "Bid",
                    "Ask",
                    "Spread",
                    "Volume",
                    "Volume financeiro",
                    "Negócios",
                    "Média por negócio",
                    "Atualização",
                    "Origem",
                    "Ações",
                  ].map((column) => (
                    <th
                      key={column}
                      style={{
                        textAlign: "left",
                        padding: 10,
                        color: "#475569",
                        borderBottom: "1px solid #cbd5e1",
                      }}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {options.map((option) => {
                  const spreadData = calculateSpreadData(option.bid, option.ask);
                  const averageVolumePerTrade =
                    option.volume !== undefined &&
                    option.trades !== undefined &&
                    option.trades > 0
                      ? option.volume / option.trades
                      : null;

                  return (
                  <tr key={option.id}>
                    <td style={{ padding: 10 }}>{option.optionCode}</td>
                    <td style={{ padding: 10 }}>
                      {option.optionType === "call" ? "Call" : "Put"}
                    </td>
                    <td style={{ padding: 10 }}>
                      {formatCurrency(option.strike)}
                    </td>
                    <td style={{ padding: 10, minWidth: 135 }}>
                      <input
                        style={{
                          ...styles.input,
                          minHeight: 34,
                          padding: "6px 8px",
                        }}
                        inputMode="decimal"
                        defaultValue={toInputNumber(option.marketPrice)}
                        onChange={(event) =>
                          handleMarketPriceChange(
                            option.id,
                            event.target.value
                          )
                        }
                        aria-label={`Preço de mercado de ${option.optionCode}`}
                      />
                    </td>
                    <td style={{ padding: 10 }}>
                      {formatCurrency(option.theoreticalPrice)}
                    </td>
                    <td style={{ padding: 10 }}>
                      {formatCurrency(
                        option.marketPrice - option.theoreticalPrice
                      )}
                    </td>
                    <td style={{ padding: 10 }}>
                      {formatPercent(option.impliedVolatility)}
                    </td>
                    <td style={{ padding: 10 }}>
                      {formatOptionalCurrency(option.bid)}
                    </td>
                    <td style={{ padding: 10 }}>
                      {formatOptionalCurrency(option.ask)}
                    </td>
                    <td style={{ padding: 10 }}>
                      {spreadData.spread === null
                        ? "—"
                        : `${formatCurrency(spreadData.spread)} (${spreadData.spreadPercent?.toFixed(2)}%)`}
                    </td>
                    <td style={{ padding: 10 }}>
                      {formatNumber(option.volume)}
                    </td>
                    <td style={{ padding: 10 }}>
                      {formatOptionalCurrency(option.financialVolume)}
                    </td>
                    <td style={{ padding: 10 }}>
                      {formatNumber(option.trades)}
                    </td>
                    <td style={{ padding: 10 }}>
                      {formatOptionalNumber(averageVolumePerTrade)}
                    </td>
                    <td style={{ padding: 10 }}>
                      {formatDateTime(option.quoteUpdatedAt)}
                    </td>
                    <td style={{ padding: 10 }}>
                      {option.source === "automatic" ? "Automática" : "Manual"}
                    </td>
                    <td style={{ padding: 10 }}>
                      <button
                        type="button"
                        style={{
                          ...styles.secondaryButton,
                          padding: "6px 10px",
                        }}
                        onClick={() =>
                          setOptions((current) =>
                            current.filter(
                              (currentOption) => currentOption.id !== option.id
                            )
                          )
                        }
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                  );
                })}

                {!options.length && (
                  <tr>
                    <td
                      colSpan={17}
                      style={{
                        padding: 24,
                        textAlign: "center",
                        color: "#64748b",
                      }}
                    >
                      Nenhuma opção adicionada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </Layout>
  );
}
