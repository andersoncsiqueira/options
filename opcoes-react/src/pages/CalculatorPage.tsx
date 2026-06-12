import { useMemo, useState, type CSSProperties, type FormEvent } from "react";

import Layout from "../components/Layout/Layout";

import {
  getAssetQuote,
  getOptionBySymbol,
  getOptionsChain,
} from "../services/optionsMarketApi";

type OptionType = "CALL" | "PUT";
type OptionTypeFilter = "all" | "call" | "put";
type ValuationStatus = "CHEAP" | "EXPENSIVE" | "FAIR";
type ApiRecord = Record<string, unknown>;

type OptionChainItem = {
  symbol: string;
  underlying?: string;
  type: "call" | "put" | "unknown";
  strike?: number;
  expirationDate?: string;
  lastPrice?: number;
  bid?: number;
  ask?: number;
  volume?: number;
  openInterest?: number;
  impliedVolatility?: number;
  raw: unknown;
};

type BlackScholesResult = {
  price: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
  d1: number;
  d2: number;
};

const DEFAULT_ASSET = "PETR4";
const DEFAULT_RISK_FREE_RATE = "10,5";
const DEFAULT_VOLATILITY = "35";
const DEFAULT_DIVIDEND_YIELD = "0";
const DEFAULT_FAIR_VALUE_THRESHOLD = "5";
const CONTRACT_SIZE = 100;

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

function unwrapObject(raw: unknown): ApiRecord {
  if (!isRecord(raw)) return {};

  if (isRecord(raw.data)) return raw.data;
  if (isRecord(raw.option)) return raw.option;
  if (isRecord(raw.quote)) return raw.quote;

  return raw;
}

function toText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;

  const text = String(value).trim();

  return text || undefined;
}

function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;

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

  const numberValue = Number(normalized);

  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function parseDecimal(value: string | number | undefined): number {
  const parsed = toNumber(value);

  return parsed ?? 0;
}

function toInputNumber(value: number | undefined): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "";

  return String(Number(value.toFixed(6))).replace(".", ",");
}

function todayAsInputDate(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDaysAsInputDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeDateForInput(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";

  if (typeof value === "number") {
    const timestamp = value < 1_000_000_000_000 ? value * 1000 : value;
    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) return "";

    return date.toISOString().slice(0, 10);
  }

  const text = String(value).trim();

  if (!text) return "";

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text.slice(0, 10);
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) return text.slice(0, 10);

  return date.toISOString().slice(0, 10);
}

function getDaysToExpiration(expirationDate: string): number {
  if (!expirationDate) return 1;

  const today = new Date(`${todayAsInputDate()}T00:00:00`);
  const expiration = new Date(`${expirationDate}T23:59:59`);

  const diffMs = expiration.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return Math.max(diffDays, 1);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatOptionCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatNumber(value: number | undefined, digits = 2): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value !== undefined && Number.isFinite(value) ? value : 0);
}

function formatInteger(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "-";

  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatPercentFromRaw(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "-";

  const percentValue = value > 1 ? value / 100 : value;

  return formatPercent(percentValue);
}

function formatDisplayDate(value: string | undefined): string {
  if (!value) return "-";

  const normalized = normalizeDateForInput(value);

  if (!normalized) return value;

  const date = new Date(`${normalized}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("pt-BR");
}

function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * absX);

  const erf =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
      0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-absX * absX));

  return 0.5 * (1 + sign * erf);
}

function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function blackScholes(params: {
  spot: number;
  strike: number;
  volatility: number;
  riskFreeRate: number;
  dividendYield: number;
  daysToExpiration: number;
  type: OptionType;
}): BlackScholesResult {
  const {
    spot,
    strike,
    volatility,
    riskFreeRate,
    dividendYield,
    daysToExpiration,
    type,
  } = params;

  const safeSpot = Math.max(spot, 0.01);
  const safeStrike = Math.max(strike, 0.01);
  const time = Math.max(daysToExpiration, 1) / 365;
  const sigma = Math.max(volatility, 0.0001);
  const rate = riskFreeRate;
  const dividend = dividendYield;
  const sqrtTime = Math.sqrt(time);

  const d1 =
    (Math.log(safeSpot / safeStrike) +
      (rate - dividend + (sigma * sigma) / 2) * time) /
    (sigma * sqrtTime);

  const d2 = d1 - sigma * sqrtTime;

  const discountedSpot = safeSpot * Math.exp(-dividend * time);
  const discountedStrike = safeStrike * Math.exp(-rate * time);

  const call =
    discountedSpot * normalCdf(d1) - discountedStrike * normalCdf(d2);

  const put =
    discountedStrike * normalCdf(-d2) - discountedSpot * normalCdf(-d1);

  const delta =
    type === "CALL"
      ? Math.exp(-dividend * time) * normalCdf(d1)
      : Math.exp(-dividend * time) * (normalCdf(d1) - 1);

  const gamma =
    (Math.exp(-dividend * time) * normalPdf(d1)) /
    (safeSpot * sigma * sqrtTime);

  const vega =
    (safeSpot * Math.exp(-dividend * time) * normalPdf(d1) * sqrtTime) / 100;

  const thetaCall =
    (-safeSpot * Math.exp(-dividend * time) * normalPdf(d1) * sigma) /
      (2 * sqrtTime) -
    rate * safeStrike * Math.exp(-rate * time) * normalCdf(d2) +
    dividend * safeSpot * Math.exp(-dividend * time) * normalCdf(d1);

  const thetaPut =
    (-safeSpot * Math.exp(-dividend * time) * normalPdf(d1) * sigma) /
      (2 * sqrtTime) +
    rate * safeStrike * Math.exp(-rate * time) * normalCdf(-d2) -
    dividend * safeSpot * Math.exp(-dividend * time) * normalCdf(-d1);

  const rhoCall =
    (safeStrike * time * Math.exp(-rate * time) * normalCdf(d2)) / 100;

  const rhoPut =
    (-safeStrike * time * Math.exp(-rate * time) * normalCdf(-d2)) / 100;

  return {
    price: Math.max(type === "CALL" ? call : put, 0),
    delta,
    gamma,
    vega,
    theta: (type === "CALL" ? thetaCall : thetaPut) / 365,
    rho: type === "CALL" ? rhoCall : rhoPut,
    d1,
    d2,
  };
}

function calculateImpliedVolatility(params: {
  spot: number;
  strike: number;
  marketPremium: number;
  riskFreeRate: number;
  dividendYield: number;
  daysToExpiration: number;
  type: OptionType;
}): number | null {
  const {
    spot,
    strike,
    marketPremium,
    riskFreeRate,
    dividendYield,
    daysToExpiration,
    type,
  } = params;

  const safeSpot = Math.max(spot, 0);
  const safeStrike = Math.max(strike, 0);
  const safeMarketPremium = Math.max(marketPremium, 0);

  if (safeMarketPremium <= 0 || safeSpot <= 0 || safeStrike <= 0) {
    return null;
  }

  const intrinsicValue =
    type === "CALL"
      ? Math.max(safeSpot - safeStrike, 0)
      : Math.max(safeStrike - safeSpot, 0);

  if (safeMarketPremium < intrinsicValue) {
    return null;
  }

  let lowVol = 0.0001;
  let highVol = 5;
  const tolerance = 0.0001;
  const maxIterations = 100;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const midVol = (lowVol + highVol) / 2;

    const result = blackScholes({
      spot: safeSpot,
      strike: safeStrike,
      volatility: midVol,
      riskFreeRate,
      dividendYield,
      daysToExpiration,
      type,
    });

    const difference = result.price - safeMarketPremium;

    if (Math.abs(difference) < tolerance) {
      return midVol;
    }

    if (result.price > safeMarketPremium) {
      highVol = midVol;
    } else {
      lowVol = midVol;
    }
  }

  return (lowVol + highVol) / 2;
}

function inferOptionType(symbol: string, raw?: ApiRecord): "call" | "put" | "unknown" {
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
      explicitType.includes("call") ||
      explicitType.includes("compra") ||
      explicitType === "c"
    ) {
      return "call";
    }

    if (
      explicitType.includes("put") ||
      explicitType.includes("venda") ||
      explicitType === "p"
    ) {
      return "put";
    }
  }

  const match = symbol.toUpperCase().match(/^[A-Z]{4}([A-X])/);

  if (!match?.[1]) return "unknown";

  const seriesLetter = match[1];

  if ("ABCDEFGHIJKL".includes(seriesLetter)) return "call";
  if ("MNOPQRSTUVWX".includes(seriesLetter)) return "put";

  return "unknown";
}

function optionTypeToUpper(type: "call" | "put" | "unknown"): OptionType {
  if (type === "put") return "PUT";

  return "CALL";
}

function normalizeOption(rawOption: unknown): OptionChainItem | null {
  if (!isRecord(rawOption)) return null;

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
    ])
  )?.toUpperCase();

  if (!symbol) return null;

  return {
    symbol,
    underlying: toText(
      readFirst(rawOption, [
        "underlying",
        "underlyingSymbol",
        "underlying_symbol",
        "underlyingAsset",
        "ativoObjeto",
        "assetUnderlying",
      ])
    )?.toUpperCase(),
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
    expirationDate: toText(
      readFirst(rawOption, [
        "expirationDate",
        "expiration_date",
        "maturityDate",
        "maturity_date",
        "dueDate",
        "due_date",
        "vencimento",
      ])
    ),
    lastPrice: toNumber(
      readFirst(rawOption, [
        "lastPrice",
        "last_price",
        "price",
        "currentPrice",
        "current_price",
        "close",
        "regularMarketPrice",
        "premium",
        "premio",
        "ultimo",
        "último",
      ])
    ),
    bid: toNumber(
      readFirst(rawOption, ["bid", "bidPrice", "bid_price", "compra"])
    ),
    ask: toNumber(
      readFirst(rawOption, ["ask", "askPrice", "ask_price", "venda"])
    ),
    volume: toNumber(
      readFirst(rawOption, ["volume", "regularMarketVolume", "volumeNegociado"])
    ),
    openInterest: toNumber(
      readFirst(rawOption, [
        "openInterest",
        "open_interest",
        "oi",
        "contratosAbertos",
        "openContracts",
      ])
    ),
    impliedVolatility: toNumber(
      readFirst(rawOption, [
        "impliedVolatility",
        "implied_volatility",
        "iv",
        "volatilidadeImplicita",
        "vol_implicita",
      ])
    ),
    raw: rawOption,
  };
}

function extractOptionCandidates(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;

  if (!isRecord(payload)) return [];

  const candidates: unknown[] = [];

  const arrayKeys = [
    "data",
    "options",
    "results",
    "items",
    "contracts",
    "chain",
    "optionChain",
  ];

  for (const key of arrayKeys) {
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
    const dateCompare = String(a.expirationDate ?? "").localeCompare(
      String(b.expirationDate ?? "")
    );

    if (dateCompare !== 0) return dateCompare;

    return Number(a.strike ?? 0) - Number(b.strike ?? 0);
  });
}

function getPremiumFromOption(option: OptionChainItem): number | undefined {
  if (option.lastPrice !== undefined) return option.lastPrice;

  if (option.bid !== undefined && option.ask !== undefined) {
    return (option.bid + option.ask) / 2;
  }

  if (option.ask !== undefined) return option.ask;
  if (option.bid !== undefined) return option.bid;

  return undefined;
}

function normalizeQuotePrice(raw: unknown): number | undefined {
  const data = unwrapObject(raw);

  return toNumber(
    readFirst(data, [
      "price",
      "currentPrice",
      "current_price",
      "regularMarketPrice",
      "regular_market_price",
      "lastPrice",
      "last_price",
      "close",
    ])
  );
}

function getPremiumStatus(
  marketPremium: number,
  theoreticalPremium: number,
  fairThresholdPercent: number
): ValuationStatus {
  const safeTheoretical = Math.max(theoreticalPremium, 0.01);
  const differencePercent =
    ((marketPremium - theoreticalPremium) / safeTheoretical) * 100;

  if (Math.abs(differencePercent) <= fairThresholdPercent) {
    return "FAIR";
  }

  return differencePercent < 0 ? "CHEAP" : "EXPENSIVE";
}

function getStatusLabel(status: ValuationStatus): string {
  if (status === "CHEAP") return "Barata";
  if (status === "EXPENSIVE") return "Cara";

  return "Justa";
}

function getStatusStyle(status: ValuationStatus): CSSProperties {
  if (status === "CHEAP") {
    return {
      background: "rgba(34, 197, 94, 0.14)",
      borderColor: "rgba(34, 197, 94, 0.35)",
      color: "#86efac",
    };
  }

  if (status === "EXPENSIVE") {
    return {
      background: "rgba(248, 113, 113, 0.14)",
      borderColor: "rgba(248, 113, 113, 0.35)",
      color: "#fecaca",
    };
  }

  return {
    background: "rgba(234, 179, 8, 0.14)",
    borderColor: "rgba(234, 179, 8, 0.35)",
    color: "#fde68a",
  };
}

function getInterpretation(status: ValuationStatus): string {
  if (status === "CHEAP") {
    return "O prêmio de mercado está abaixo do preço teórico calculado.";
  }

  if (status === "EXPENSIVE") {
    return "O prêmio de mercado está acima do preço teórico calculado.";
  }

  return "O prêmio de mercado está próximo do preço teórico calculado.";
}

export default function CalculatorPage() {
  const [asset, setAsset] = useState(DEFAULT_ASSET);
  const [assetForChain, setAssetForChain] = useState(DEFAULT_ASSET);
  const [optionCode, setOptionCode] = useState("");
  const [optionType, setOptionType] = useState<OptionType>("CALL");
  const [spot, setSpot] = useState("");
  const [strike, setStrike] = useState("");
  const [marketPremium, setMarketPremium] = useState("");
  const [volatility, setVolatility] = useState(DEFAULT_VOLATILITY);
  const [riskFreeRate, setRiskFreeRate] = useState(DEFAULT_RISK_FREE_RATE);
  const [dividendYield, setDividendYield] = useState(DEFAULT_DIVIDEND_YIELD);
  const [expirationDate, setExpirationDate] = useState(addDaysAsInputDate(30));
  const [fairValueThreshold, setFairValueThreshold] = useState(
    DEFAULT_FAIR_VALUE_THRESHOLD
  );
  const [quantity, setQuantity] = useState("1");

  const [chainOptions, setChainOptions] = useState<OptionChainItem[]>([]);
  const [selectedChainSymbol, setSelectedChainSymbol] = useState("");
  const [typeFilter, setTypeFilter] = useState<OptionTypeFilter>("all");
  const [textFilter, setTextFilter] = useState("");

  const [isChainLoading, setIsChainLoading] = useState(false);
  const [isOptionLoading, setIsOptionLoading] = useState(false);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);

  const [chainError, setChainError] = useState("");
  const [optionError, setOptionError] = useState("");
  const [quoteError, setQuoteError] = useState("");
  const [lastCalculatedAt, setLastCalculatedAt] = useState<Date | null>(null);

  const parsedSpot = parseDecimal(spot);
  const parsedStrike = parseDecimal(strike);
  const parsedMarketPremium = Math.max(parseDecimal(marketPremium), 0);
  const parsedVolatility = Math.max(parseDecimal(volatility), 0) / 100;
  const parsedRiskFreeRate = parseDecimal(riskFreeRate) / 100;
  const parsedDividendYield = parseDecimal(dividendYield) / 100;
  const parsedFairValueThreshold = parseDecimal(fairValueThreshold);
  const parsedQuantity = Math.max(Math.floor(parseDecimal(quantity)), 1);

  const daysToExpiration = useMemo(
    () => getDaysToExpiration(expirationDate),
    [expirationDate]
  );

  const blackScholesResult = useMemo(() => {
    return blackScholes({
      spot: parsedSpot,
      strike: parsedStrike || parsedSpot || 0.01,
      volatility: parsedVolatility,
      riskFreeRate: parsedRiskFreeRate,
      dividendYield: parsedDividendYield,
      daysToExpiration,
      type: optionType,
    });
  }, [
    parsedSpot,
    parsedStrike,
    parsedVolatility,
    parsedRiskFreeRate,
    parsedDividendYield,
    daysToExpiration,
    optionType,
  ]);

  const impliedVolatility = useMemo(() => {
    return calculateImpliedVolatility({
      spot: parsedSpot,
      strike: parsedStrike,
      marketPremium: parsedMarketPremium,
      riskFreeRate: parsedRiskFreeRate,
      dividendYield: parsedDividendYield,
      daysToExpiration,
      type: optionType,
    });
  }, [
    parsedSpot,
    parsedStrike,
    parsedMarketPremium,
    parsedRiskFreeRate,
    parsedDividendYield,
    daysToExpiration,
    optionType,
  ]);

  const difference = parsedMarketPremium - blackScholesResult.price;

  const differencePercent =
    blackScholesResult.price > 0.0001
      ? difference / blackScholesResult.price
      : 0;

  const valuationStatus = getPremiumStatus(
    parsedMarketPremium,
    blackScholesResult.price,
    parsedFairValueThreshold
  );

  const totalMarketValue = parsedMarketPremium * parsedQuantity * CONTRACT_SIZE;
  const totalTheoreticalValue =
    blackScholesResult.price * parsedQuantity * CONTRACT_SIZE;

  const filteredChainOptions = useMemo(() => {
    const search = textFilter.trim().toUpperCase();

    return chainOptions.filter((option) => {
      const matchesType = typeFilter === "all" || option.type === typeFilter;

      const matchesSearch =
        !search ||
        option.symbol.includes(search) ||
        String(option.strike ?? "").includes(search);

      return matchesType && matchesSearch;
    });
  }, [chainOptions, typeFilter, textFilter]);

  async function loadAssetQuote(assetSymbol = asset) {
    const cleanAsset = assetSymbol.trim().toUpperCase();

    if (!cleanAsset) return;

    setIsQuoteLoading(true);
    setQuoteError("");

    try {
      const quote = await getAssetQuote(cleanAsset);
      const price = normalizeQuotePrice(quote);

      if (price !== undefined) {
        setSpot(toInputNumber(price));
      } else {
        setQuoteError("A API respondeu, mas não encontrei o preço do ativo.");
      }
    } catch (error) {
      console.error("Erro ao buscar preço do ativo:", error);

      setQuoteError("Não foi possível buscar o preço atual do ativo.");
    } finally {
      setIsQuoteLoading(false);
    }
  }

  function applyOptionToCalculator(option: OptionChainItem) {
    const premium = getPremiumFromOption(option);
    const nextAsset = option.underlying || assetForChain || asset;

    setSelectedChainSymbol(option.symbol);
    setOptionCode(option.symbol);
    setOptionType(optionTypeToUpper(option.type));

    if (nextAsset) {
      setAsset(nextAsset);
      setAssetForChain(nextAsset);
      void loadAssetQuote(nextAsset);
    }

    if (option.strike !== undefined) {
      setStrike(toInputNumber(option.strike));
    }

    if (option.expirationDate) {
      const normalizedExpiration = normalizeDateForInput(option.expirationDate);

      if (normalizedExpiration) {
        setExpirationDate(normalizedExpiration);
      }
    }

    if (premium !== undefined) {
      setMarketPremium(toInputNumber(premium));
    }

    if (option.impliedVolatility !== undefined) {
      const normalizedIv =
        option.impliedVolatility > 1
          ? option.impliedVolatility
          : option.impliedVolatility * 100;

      setVolatility(toInputNumber(normalizedIv));
    }

    setLastCalculatedAt(new Date());
  }

  async function handleSearchChain(event: FormEvent) {
    event.preventDefault();

    const cleanAsset = assetForChain.trim().toUpperCase();

    if (!cleanAsset) {
      setChainError("Digite o código da ação. Exemplo: PETR4.");
      return;
    }

    setIsChainLoading(true);
    setChainError("");
    setOptionError("");
    setChainOptions([]);
    setSelectedChainSymbol("");
    setAsset(cleanAsset);

    try {
      const response = await getOptionsChain(cleanAsset);
      const normalizedOptions = normalizeOptionsPayload(response);

      setChainOptions(normalizedOptions);

      if (normalizedOptions.length === 0) {
        setChainError(`Nenhuma opção encontrada para ${cleanAsset}.`);
      }

      void loadAssetQuote(cleanAsset);
    } catch (error) {
      console.error("Erro ao buscar cadeia de opções:", error);

      setChainError(
        error instanceof Error
          ? error.message
          : "Não foi possível buscar as opções desse ativo."
      );
    } finally {
      setIsChainLoading(false);
    }
  }

  async function handleSearchOptionByCode(event: FormEvent) {
    event.preventDefault();

    const cleanOptionCode = optionCode.trim().toUpperCase();

    if (!cleanOptionCode) {
      setOptionError("Digite o código da opção. Exemplo: PETRG424.");
      return;
    }

    setIsOptionLoading(true);
    setOptionError("");

    try {
      const response = await getOptionBySymbol(cleanOptionCode);
      const normalizedOption = normalizeOption(unwrapObject(response));

      if (!normalizedOption) {
        setOptionError("A API respondeu, mas não encontrei os dados da opção.");
        return;
      }

      applyOptionToCalculator(normalizedOption);
    } catch (error) {
      console.error("Erro ao buscar opção:", error);

      setOptionError(
        error instanceof Error
          ? error.message
          : "Não foi possível buscar os dados da opção."
      );
    } finally {
      setIsOptionLoading(false);
    }
  }

  function handleUseImpliedVolatility() {
    if (impliedVolatility === null) return;

    setVolatility(toInputNumber(impliedVolatility * 100));
    setLastCalculatedAt(new Date());
  }

  function handleCalculate() {
    setLastCalculatedAt(new Date());
  }

  const hasEnoughData =
    parsedSpot > 0 &&
    parsedStrike > 0 &&
    parsedVolatility > 0 &&
    daysToExpiration > 0;

  return (
    <Layout>
      <main style={styles.page}>
        <section style={styles.headerCard}>
          <div>
            <p style={styles.eyebrow}>Options Terminal</p>

            <h1 style={styles.title}>Calculadora de Opções</h1>

            <p style={styles.subtitle}>
              Digite o ativo para listar as opções disponíveis, selecione uma
              opção e calcule preço teórico, volatilidade implícita e gregas.
            </p>
          </div>

          <div style={styles.headerActions}>
            {lastCalculatedAt && (
              <span style={styles.lastCalculation}>
                Atualizado às{" "}
                {lastCalculatedAt.toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            )}

            <button
              style={styles.primaryButton}
              type="button"
              onClick={handleCalculate}
            >
              Calcular
            </button>

            <div
              style={{
                ...styles.statusBadge,
                ...getStatusStyle(valuationStatus),
              }}
            >
              Opção {getStatusLabel(valuationStatus)}
            </div>
          </div>
        </section>

        <section style={styles.card}>
          <div style={styles.sectionHeader}>
            <div>
              <h2 style={styles.cardTitle}>Opções disponíveis por ativo</h2>

              <p style={styles.sectionText}>
                Digite o código da ação para puxar a lista de opções e clique em
                usar para preencher a calculadora.
              </p>
            </div>
          </div>

          <form style={styles.searchForm} onSubmit={handleSearchChain}>
            <input
              style={styles.searchInput}
              value={assetForChain}
              onChange={(event) =>
                setAssetForChain(event.target.value.toUpperCase())
              }
              placeholder="Ex: PETR4"
            />

            <button
              style={styles.primaryButton}
              type="submit"
              disabled={isChainLoading}
            >
              {isChainLoading ? "Buscando..." : "Buscar opções"}
            </button>
          </form>

          {chainError && <div style={styles.errorBox}>{chainError}</div>}

          {chainOptions.length > 0 && (
            <>
              <div style={styles.filtersRow}>
                <select
                  style={styles.select}
                  value={typeFilter}
                  onChange={(event) =>
                    setTypeFilter(event.target.value as OptionTypeFilter)
                  }
                >
                  <option value="all">Calls e puts</option>
                  <option value="call">Somente calls</option>
                  <option value="put">Somente puts</option>
                </select>

                <input
                  style={styles.filterInput}
                  value={textFilter}
                  onChange={(event) => setTextFilter(event.target.value)}
                  placeholder="Filtrar por código ou strike"
                />
              </div>

              <div style={styles.tableCounter}>
                {filteredChainOptions.length} opção(ões) encontrada(s)
              </div>

              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Código</th>
                      <th style={styles.th}>Tipo</th>
                      <th style={styles.th}>Strike</th>
                      <th style={styles.th}>Vencimento</th>
                      <th style={styles.th}>Último</th>
                      <th style={styles.th}>Bid</th>
                      <th style={styles.th}>Ask</th>
                      <th style={styles.th}>Volume</th>
                      <th style={styles.th}>OI</th>
                      <th style={styles.th}>IV</th>
                      <th style={styles.th}></th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredChainOptions.map((option) => {
                      const selected = selectedChainSymbol === option.symbol;

                      return (
                        <tr
                          key={option.symbol}
                          style={selected ? styles.selectedTableRow : undefined}
                        >
                          <td style={styles.td}>
                            <strong style={styles.symbolText}>
                              {option.symbol}
                            </strong>
                          </td>

                          <td style={styles.td}>
                            <span
                              style={{
                                ...styles.optionBadge,
                                ...(option.type === "call"
                                  ? styles.callBadge
                                  : option.type === "put"
                                  ? styles.putBadge
                                  : styles.unknownBadge),
                              }}
                            >
                              {option.type === "call"
                                ? "CALL"
                                : option.type === "put"
                                ? "PUT"
                                : "-"}
                            </span>
                          </td>

                          <td style={styles.td}>
                            {option.strike !== undefined
                              ? formatCurrency(option.strike)
                              : "-"}
                          </td>

                          <td style={styles.td}>
                            {formatDisplayDate(option.expirationDate)}
                          </td>

                          <td style={styles.td}>
                            {option.lastPrice !== undefined
                              ? formatOptionCurrency(option.lastPrice)
                              : "-"}
                          </td>

                          <td style={styles.td}>
                            {option.bid !== undefined
                              ? formatOptionCurrency(option.bid)
                              : "-"}
                          </td>

                          <td style={styles.td}>
                            {option.ask !== undefined
                              ? formatOptionCurrency(option.ask)
                              : "-"}
                          </td>

                          <td style={styles.td}>
                            {formatInteger(option.volume)}
                          </td>

                          <td style={styles.td}>
                            {formatInteger(option.openInterest)}
                          </td>

                          <td style={styles.td}>
                            {formatPercentFromRaw(option.impliedVolatility)}
                          </td>

                          <td style={styles.td}>
                            <button
                              style={{
                                ...styles.smallButton,
                                ...(selected ? styles.successButton : {}),
                              }}
                              type="button"
                              onClick={() => applyOptionToCalculator(option)}
                            >
                              {selected ? "Selecionada" : "Usar"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredChainOptions.length === 0 && (
                      <tr>
                        <td style={styles.emptyCell} colSpan={11}>
                          Nenhuma opção bate com o filtro informado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section style={styles.card}>
          <div style={styles.sectionHeader}>
            <div>
              <h2 style={styles.cardTitle}>Buscar opção pelo código</h2>

              <p style={styles.sectionText}>
                Também dá para buscar uma opção específica. Os campos que a API
                não encontrar continuam editáveis.
              </p>
            </div>
          </div>

          <form style={styles.searchForm} onSubmit={handleSearchOptionByCode}>
            <input
              style={styles.searchInput}
              value={optionCode}
              onChange={(event) =>
                setOptionCode(event.target.value.toUpperCase())
              }
              placeholder="Ex: PETRG424"
            />

            <button
              style={styles.primaryButton}
              type="submit"
              disabled={isOptionLoading}
            >
              {isOptionLoading ? "Buscando..." : "Buscar opção"}
            </button>
          </form>

          {optionError && <div style={styles.errorBox}>{optionError}</div>}
        </section>

        <section style={styles.grid}>
          <div style={styles.card}>
            <div style={styles.sectionHeader}>
              <div>
                <h2 style={styles.cardTitle}>Dados para o cálculo</h2>

                <p style={styles.sectionText}>
                  Ajuste manualmente qualquer campo que não vier preenchido pela
                  API.
                </p>
              </div>

              <button
                style={styles.secondaryButton}
                type="button"
                onClick={() => void loadAssetQuote(asset)}
                disabled={isQuoteLoading}
              >
                {isQuoteLoading ? "Buscando..." : "Atualizar ativo"}
              </button>
            </div>

            {quoteError && <div style={styles.errorBox}>{quoteError}</div>}

            <div style={styles.formGrid}>
              <label style={styles.label}>
                Ativo
                <input
                  style={styles.input}
                  value={asset}
                  onChange={(event) => setAsset(event.target.value.toUpperCase())}
                  placeholder="Ex: PETR4"
                />
              </label>

              <label style={styles.label}>
                Código da opção
                <input
                  style={styles.input}
                  value={optionCode}
                  onChange={(event) =>
                    setOptionCode(event.target.value.toUpperCase())
                  }
                  placeholder="Ex: PETRG424"
                />
              </label>

              <label style={styles.label}>
                Tipo
                <select
                  style={styles.input}
                  value={optionType}
                  onChange={(event) =>
                    setOptionType(event.target.value as OptionType)
                  }
                >
                  <option value="CALL">CALL</option>
                  <option value="PUT">PUT</option>
                </select>
              </label>

              <label style={styles.label}>
                Preço atual do ativo
                <input
                  style={styles.input}
                  value={spot}
                  inputMode="decimal"
                  onChange={(event) => setSpot(event.target.value)}
                  placeholder="Ex: 40,36"
                />
              </label>

              <label style={styles.label}>
                Strike
                <input
                  style={styles.input}
                  value={strike}
                  inputMode="decimal"
                  onChange={(event) => setStrike(event.target.value)}
                  placeholder="Ex: 42,00"
                />
              </label>

              <label style={styles.label}>
                Prêmio de mercado
                <input
                  style={styles.input}
                  value={marketPremium}
                  inputMode="decimal"
                  onChange={(event) => setMarketPremium(event.target.value)}
                  placeholder="Ex: 1,25"
                />
              </label>

              <label style={styles.label}>
                Vencimento
                <input
                  style={styles.input}
                  type="date"
                  value={expirationDate}
                  onChange={(event) => setExpirationDate(event.target.value)}
                />
              </label>

              <label style={styles.label}>
                Dias até o vencimento
                <input
                  style={{ ...styles.input, opacity: 0.72 }}
                  value={daysToExpiration}
                  readOnly
                />
              </label>

              <label style={styles.label}>
                Volatilidade usada %
                <input
                  style={styles.input}
                  value={volatility}
                  inputMode="decimal"
                  onChange={(event) => setVolatility(event.target.value)}
                  placeholder="Ex: 35"
                />
              </label>

              <label style={styles.label}>
                Taxa livre de risco anual %
                <input
                  style={styles.input}
                  value={riskFreeRate}
                  inputMode="decimal"
                  onChange={(event) => setRiskFreeRate(event.target.value)}
                  placeholder="Ex: 10,5"
                />
              </label>

              <label style={styles.label}>
                Dividend yield anual %
                <input
                  style={styles.input}
                  value={dividendYield}
                  inputMode="decimal"
                  onChange={(event) => setDividendYield(event.target.value)}
                  placeholder="Ex: 0"
                />
              </label>

              <label style={styles.label}>
                Quantidade de contratos
                <input
                  style={styles.input}
                  value={quantity}
                  type="number"
                  min="1"
                  step="1"
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </label>

              <label style={styles.label}>
                Margem para considerar justo %
                <input
                  style={styles.input}
                  value={fairValueThreshold}
                  inputMode="decimal"
                  onChange={(event) =>
                    setFairValueThreshold(event.target.value)
                  }
                  placeholder="Ex: 5"
                />
              </label>
            </div>

            {!hasEnoughData && (
              <div style={styles.warningBox}>
                Preencha preço do ativo, strike, volatilidade e vencimento para
                o cálculo ficar completo.
              </div>
            )}
          </div>

          <div style={styles.card}>
            <div style={styles.resultHeader}>
              <div>
                <h2 style={styles.cardTitle}>Resultado</h2>

                <p style={styles.sectionText}>
                  Black-Scholes, volatilidade implícita e gregas.
                </p>
              </div>

              <div
                style={{
                  ...styles.statusBadge,
                  ...getStatusStyle(valuationStatus),
                }}
              >
                {getStatusLabel(valuationStatus)}
              </div>
            </div>

            <div style={styles.resultPriceBox}>
              <span style={styles.metricLabel}>Preço teórico Black-Scholes</span>

              <strong style={styles.resultPrice}>
                {formatOptionCurrency(blackScholesResult.price)}
              </strong>

              <small style={styles.metricHint}>
                Calculado com a volatilidade informada
              </small>
            </div>

            <div style={styles.resultGrid}>
              <div style={styles.metricBox}>
                <span style={styles.metricLabel}>Prêmio mercado</span>
                <strong style={styles.metricValue}>
                  {formatOptionCurrency(parsedMarketPremium)}
                </strong>
                <small style={styles.metricHint}>Valor atual da opção</small>
              </div>

              <div style={styles.metricBox}>
                <span style={styles.metricLabel}>Diferença</span>
                <strong style={styles.metricValue}>
                  {formatOptionCurrency(difference)}
                </strong>
                <small style={styles.metricHint}>
                  {formatPercent(differencePercent)}
                </small>
              </div>

              <div style={styles.metricBox}>
                <span style={styles.metricLabel}>Volatilidade implícita</span>
                <strong style={styles.metricValue}>
                  {impliedVolatility !== null
                    ? formatPercent(impliedVolatility)
                    : "Não calculada"}
                </strong>
                <small style={styles.metricHint}>
                  Extraída do prêmio de mercado
                </small>
              </div>

              <div style={styles.metricBox}>
                <span style={styles.metricLabel}>Status</span>
                <strong style={styles.metricValue}>
                  Opção {getStatusLabel(valuationStatus)}
                </strong>
                <small style={styles.metricHint}>
                  {getInterpretation(valuationStatus)}
                </small>
              </div>

              <div style={styles.metricBox}>
                <span style={styles.metricLabel}>Total mercado</span>
                <strong style={styles.metricValue}>
                  {formatCurrency(totalMarketValue)}
                </strong>
                <small style={styles.metricHint}>
                  {parsedQuantity} contrato(s) × 100 opções
                </small>
              </div>

              <div style={styles.metricBox}>
                <span style={styles.metricLabel}>Total teórico</span>
                <strong style={styles.metricValue}>
                  {formatCurrency(totalTheoreticalValue)}
                </strong>
                <small style={styles.metricHint}>
                  {parsedQuantity} contrato(s) × 100 opções
                </small>
              </div>
            </div>

            <div style={styles.actionsRow}>
              <button
                style={styles.secondaryButton}
                type="button"
                onClick={handleUseImpliedVolatility}
                disabled={impliedVolatility === null}
              >
                Usar vol. implícita
              </button>

              <button
                style={styles.primaryButton}
                type="button"
                onClick={handleCalculate}
              >
                Recalcular
              </button>
            </div>

            <div style={styles.greeksGrid}>
              <div style={styles.greekBox}>
                <span>Delta</span>
                <strong>{formatNumber(blackScholesResult.delta, 4)}</strong>
              </div>

              <div style={styles.greekBox}>
                <span>Gamma</span>
                <strong>{formatNumber(blackScholesResult.gamma, 6)}</strong>
              </div>

              <div style={styles.greekBox}>
                <span>Theta/dia</span>
                <strong>{formatOptionCurrency(blackScholesResult.theta)}</strong>
              </div>

              <div style={styles.greekBox}>
                <span>Vega</span>
                <strong>{formatOptionCurrency(blackScholesResult.vega)}</strong>
              </div>

              <div style={styles.greekBox}>
                <span>Rho</span>
                <strong>{formatOptionCurrency(blackScholesResult.rho)}</strong>
              </div>

              <div style={styles.greekBox}>
                <span>D1 / D2</span>
                <strong>
                  {formatNumber(blackScholesResult.d1, 3)} /{" "}
                  {formatNumber(blackScholesResult.d2, 3)}
                </strong>
              </div>
            </div>
          </div>
        </section>

        <section style={styles.warningBox}>
          <strong>Importante:</strong> Black-Scholes é um modelo teórico. Ele
          ajuda a comparar preço, mas não garante que a opção esteja realmente
          barata ou cara. Liquidez, spread, dividendos, exercício, eventos e
          atraso de cotação podem distorcer bastante o prêmio de mercado.
        </section>
      </main>
    </Layout>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: "24px",
    padding: "24px",
    color: "var(--text-main, #e5e7eb)",
  },

  headerCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "18px",
    flexWrap: "wrap",
    padding: "26px",
    borderRadius: "22px",
    border: "1px solid var(--border-color, rgba(148, 163, 184, 0.24))",
    background: "var(--bg-card, rgba(15, 23, 42, 0.92))",
  },

  headerActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "12px",
    flexWrap: "wrap",
  },

  lastCalculation: {
    color: "var(--text-muted, #94a3b8)",
    fontSize: "12px",
  },

  eyebrow: {
    margin: 0,
    color: "var(--text-muted, #94a3b8)",
    fontSize: "13px",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
  },

  title: {
    margin: "6px 0 8px",
    color: "#ffffff",
    fontSize: "34px",
    lineHeight: 1.08,
  },

  subtitle: {
    margin: 0,
    color: "var(--text-muted, #94a3b8)",
    maxWidth: "760px",
    fontSize: "16px",
    lineHeight: 1.45,
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
    gap: "24px",
  },

  card: {
    padding: "24px",
    borderRadius: "22px",
    border: "1px solid var(--border-color, rgba(148, 163, 184, 0.24))",
    background: "var(--bg-card, rgba(15, 23, 42, 0.92))",
    boxShadow: "0 18px 45px rgba(0, 0, 0, 0.18)",
  },

  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    flexWrap: "wrap",
    marginBottom: "18px",
  },

  cardTitle: {
    margin: 0,
    color: "#ffffff",
    fontSize: "24px",
    lineHeight: 1.2,
  },

  sectionText: {
    margin: "8px 0 0",
    color: "var(--text-muted, #94a3b8)",
    fontSize: "14px",
    lineHeight: 1.45,
  },

  searchForm: {
    display: "grid",
    gridTemplateColumns: "minmax(220px, 1fr) 180px",
    gap: "12px",
    alignItems: "stretch",
  },

  searchInput: {
    height: "52px",
    border: "1px solid rgba(148, 163, 184, 0.35)",
    borderRadius: "16px",
    background: "rgba(15, 23, 42, 0.96)",
    color: "#ffffff",
    outline: "none",
    padding: "0 16px",
    fontSize: "16px",
    fontWeight: 800,
    textTransform: "uppercase",
  },

  primaryButton: {
    minHeight: "46px",
    border: 0,
    borderRadius: "16px",
    background: "linear-gradient(135deg, #6366f1, #7c3aed)",
    color: "#ffffff",
    cursor: "pointer",
    padding: "0 18px",
    fontSize: "14px",
    fontWeight: 900,
    boxShadow: "0 10px 24px rgba(99, 102, 241, 0.28)",
  },

  secondaryButton: {
    minHeight: "42px",
    borderRadius: "14px",
    border: "1px solid rgba(148, 163, 184, 0.26)",
    background: "rgba(15, 23, 42, 0.72)",
    color: "#e5e7eb",
    cursor: "pointer",
    padding: "0 14px",
    fontSize: "13px",
    fontWeight: 800,
  },

  smallButton: {
    border: 0,
    borderRadius: "10px",
    background: "#6366f1",
    color: "#ffffff",
    cursor: "pointer",
    padding: "8px 12px",
    fontSize: "12px",
    fontWeight: 900,
  },

  successButton: {
    background: "#059669",
  },

  filtersRow: {
    display: "grid",
    gridTemplateColumns: "190px minmax(200px, 1fr)",
    gap: "12px",
    marginTop: "18px",
  },

  select: {
    height: "44px",
    border: "1px solid rgba(148, 163, 184, 0.35)",
    borderRadius: "14px",
    background: "rgba(15, 23, 42, 0.96)",
    color: "#ffffff",
    outline: "none",
    padding: "0 12px",
    fontSize: "14px",
    fontWeight: 700,
  },

  filterInput: {
    height: "44px",
    border: "1px solid rgba(148, 163, 184, 0.35)",
    borderRadius: "14px",
    background: "rgba(15, 23, 42, 0.96)",
    color: "#ffffff",
    outline: "none",
    padding: "0 14px",
    fontSize: "14px",
    fontWeight: 700,
    textTransform: "uppercase",
  },

  tableCounter: {
    margin: "14px 0 10px",
    color: "var(--text-muted, #94a3b8)",
    fontSize: "13px",
  },

  tableWrapper: {
    maxHeight: "520px",
    overflow: "auto",
    border: "1px solid rgba(148, 163, 184, 0.22)",
    borderRadius: "16px",
  },

  table: {
    width: "100%",
    minWidth: "1080px",
    borderCollapse: "collapse",
    fontSize: "13px",
  },

  th: {
    position: "sticky",
    top: 0,
    zIndex: 1,
    background: "#111827",
    color: "#9ca3af",
    textAlign: "left",
    padding: "13px 12px",
    borderBottom: "1px solid rgba(148, 163, 184, 0.24)",
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },

  td: {
    padding: "13px 12px",
    borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
    color: "#e5e7eb",
    whiteSpace: "nowrap",
  },

  selectedTableRow: {
    background: "rgba(5, 150, 105, 0.12)",
  },

  symbolText: {
    color: "#ffffff",
    fontWeight: 900,
  },

  optionBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "48px",
    borderRadius: "999px",
    padding: "4px 9px",
    fontSize: "11px",
    fontWeight: 900,
  },

  callBadge: {
    background: "rgba(22, 163, 74, 0.18)",
    color: "#86efac",
  },

  putBadge: {
    background: "rgba(220, 38, 38, 0.18)",
    color: "#fca5a5",
  },

  unknownBadge: {
    background: "rgba(148, 163, 184, 0.16)",
    color: "#cbd5e1",
  },

  emptyCell: {
    padding: "28px",
    textAlign: "center",
    color: "#9ca3af",
  },

  errorBox: {
    marginTop: "14px",
    border: "1px solid rgba(248, 113, 113, 0.38)",
    background: "rgba(127, 29, 29, 0.35)",
    color: "#fecaca",
    borderRadius: "16px",
    padding: "14px 16px",
    fontSize: "14px",
    lineHeight: 1.45,
  },

  warningBox: {
    border: "1px solid rgba(234, 179, 8, 0.28)",
    borderRadius: "18px",
    background: "rgba(113, 63, 18, 0.18)",
    color: "#fde68a",
    padding: "16px",
    fontSize: "14px",
    lineHeight: 1.5,
  },

  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: "14px",
  },

  label: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    color: "var(--text-muted, #94a3b8)",
    fontSize: "13px",
    fontWeight: 800,
  },

  input: {
    height: "48px",
    border: "1px solid rgba(148, 163, 184, 0.28)",
    borderRadius: "14px",
    background: "rgba(15, 23, 42, 0.9)",
    color: "#ffffff",
    outline: "none",
    padding: "0 14px",
    fontSize: "15px",
    fontWeight: 700,
  },

  resultHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "14px",
    flexWrap: "wrap",
    marginBottom: "18px",
  },

  resultPriceBox: {
    border: "1px solid rgba(148, 163, 184, 0.18)",
    borderRadius: "20px",
    background: "rgba(30, 41, 59, 0.86)",
    padding: "20px",
    marginBottom: "16px",
  },

  resultPrice: {
    display: "block",
    margin: "8px 0",
    color: "#ffffff",
    fontSize: "34px",
    lineHeight: 1.1,
  },

  resultGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: "12px",
  },

  metricBox: {
    border: "1px solid rgba(148, 163, 184, 0.18)",
    borderRadius: "16px",
    background: "rgba(30, 41, 59, 0.72)",
    padding: "14px",
    minHeight: "96px",
  },

  metricLabel: {
    display: "block",
    color: "var(--text-muted, #94a3b8)",
    fontSize: "12px",
    fontWeight: 800,
    marginBottom: "6px",
  },

  metricValue: {
    display: "block",
    color: "#ffffff",
    fontSize: "18px",
    lineHeight: 1.2,
  },

  metricHint: {
    display: "block",
    marginTop: "6px",
    color: "var(--text-muted, #94a3b8)",
    fontSize: "12px",
    lineHeight: 1.35,
  },

  actionsRow: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    flexWrap: "wrap",
    margin: "16px 0",
  },

  statusBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "36px",
    border: "1px solid transparent",
    borderRadius: "999px",
    padding: "0 14px",
    fontSize: "13px",
    fontWeight: 900,
    whiteSpace: "nowrap",
  },

  greeksGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: "10px",
  },

  greekBox: {
    border: "1px solid rgba(148, 163, 184, 0.18)",
    borderRadius: "14px",
    background: "rgba(15, 23, 42, 0.62)",
    padding: "12px",
  },
};
