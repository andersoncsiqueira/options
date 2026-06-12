import { useMemo, useState, type CSSProperties } from "react";

import Layout from "../components/Layout/Layout";
import { getQuote } from "../services/marketData/marketDataService";
import { getOptionBySymbol } from "../services/optionsMarketApi";

type OptionType = "CALL" | "PUT";
type OptionTypeInput = OptionType | "";

type ApiRecord = Record<string, unknown>;

type BlackScholesResult = {
  price: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  d1: number;
  d2: number;
};

type CalculationResult = {
  theoreticalPrice: number | null;
  impliedVolatility: number | null;
  difference: number | null;
  differencePercent: number | null;
  delta: number | null;
  gamma: number | null;
  vega: number | null;
  theta: number | null;
  greekSource: string;
  error: string;
};

const CALL_SERIES = "ABCDEFGHIJKL";
const PUT_SERIES = "MNOPQRSTUVWX";

const OPTION_PRICE_KEYS = [
  "lastPrice",
  "last",
  "premium",
  "marketPremium",
  "optionPremium",
  "regularMarketPrice",
  "close",
  "bid",
  "ask",
  "markPrice",
  "marketPrice",
  "ultimoPreco",
  "precoAtual",
  "preco",
  "price",
];

const STRIKE_KEYS = [
  "strike",
  "strikePrice",
  "exercisePrice",
  "precoExercicio",
  "precoDeExercicio",
];

const EXPIRATION_KEYS = [
  "expirationDate",
  "expiration",
  "maturityDate",
  "dueDate",
  "expiresAt",
  "vencimento",
  "dataVencimento",
];

const OPTION_TYPE_KEYS = [
  "type",
  "optionType",
  "kind",
  "callPut",
  "right",
  "tipo",
];

const UNDERLYING_KEYS = [
  "underlying",
  "underlyingSymbol",
  "underlyingAsset",
  "asset",
  "assetSymbol",
  "stock",
  "stockSymbol",
  "tickerAsset",
  "baseAsset",
  "ativo",
];

const UNDERLYING_PRICE_KEYS = [
  "underlyingPrice",
  "underlyingLastPrice",
  "spot",
  "spotPrice",
  "assetPrice",
  "stockPrice",
  "precoAtivo",
  "precoAtualAtivo",
];

function isRecord(value: unknown): value is ApiRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function parseDecimal(value: string | number | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") return null;

  const cleaned = value
    .trim()
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3})/g, "")
    .replace(",", ".");

  if (!cleaned) return null;

  const parsed = Number(cleaned);

  return Number.isFinite(parsed) ? parsed : null;
}

function formatInputNumber(value: number, digits = 2) {
  return value.toFixed(digits).replace(".", ",");
}

function formatCurrency(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) return "—";

  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";

  return value.toLocaleString("pt-BR", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatNumber(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) return "—";

  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function todayAsInputDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeDateToInput(value: unknown): string {
  if (typeof value !== "string") return "";

  const cleanValue = value.trim();

  if (!cleanValue) return "";

  const isoMatch = cleanValue.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const brMatch = cleanValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (brMatch) {
    return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  }

  const date = new Date(cleanValue);

  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDaysToExpiration(expirationDate: string): number | null {
  if (!expirationDate) return null;

  const today = new Date(`${todayAsInputDate()}T00:00:00`);
  const expiration = new Date(`${expirationDate}T23:59:59`);

  if (Number.isNaN(expiration.getTime())) return null;

  const diffMs = expiration.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return Math.max(diffDays, 1);
}

function findValueByKeys(value: unknown, keys: string[], depth = 0): unknown {
  if (depth > 6) return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValueByKeys(item, keys, depth + 1);

      if (found !== undefined && found !== null && found !== "") {
        return found;
      }
    }

    return undefined;
  }

  if (!isRecord(value)) return undefined;

  const lowerKeys = keys.map((key) => key.toLowerCase());

  for (const [recordKey, recordValue] of Object.entries(value)) {
    if (lowerKeys.includes(recordKey.toLowerCase())) {
      if (
        recordValue !== undefined &&
        recordValue !== null &&
        recordValue !== ""
      ) {
        return recordValue;
      }
    }
  }

  const priorityKeys = [
    "data",
    "option",
    "quote",
    "result",
    "results",
    "payload",
    "body",
  ];

  for (const key of priorityKeys) {
    const found = findValueByKeys(value[key], keys, depth + 1);

    if (found !== undefined && found !== null && found !== "") {
      return found;
    }
  }

  for (const nestedValue of Object.values(value)) {
    const found = findValueByKeys(nestedValue, keys, depth + 1);

    if (found !== undefined && found !== null && found !== "") {
      return found;
    }
  }

  return undefined;
}

function parseOptionType(value: unknown): OptionTypeInput {
  if (typeof value !== "string") return "";

  const cleanValue = value.trim().toUpperCase();

  if (cleanValue.includes("CALL") || cleanValue === "C") return "CALL";
  if (cleanValue.includes("PUT") || cleanValue === "P") return "PUT";

  return "";
}

function inferTypeFromOptionCode(optionCode: string): OptionTypeInput {
  const cleanCode = normalizeCode(optionCode);
  const firstDigitIndex = cleanCode.search(/\d/);

  if (firstDigitIndex <= 0) return "";

  const prefix = cleanCode.slice(0, firstDigitIndex);
  const seriesLetter = prefix.slice(-1);

  if (CALL_SERIES.includes(seriesLetter)) return "CALL";
  if (PUT_SERIES.includes(seriesLetter)) return "PUT";

  return "";
}

function inferUnderlyingFromOptionCode(optionCode: string): string {
  const cleanCode = normalizeCode(optionCode);
  const firstDigitIndex = cleanCode.search(/\d/);

  if (firstDigitIndex <= 0) return "";

  const prefix = cleanCode.slice(0, firstDigitIndex);
  const base = prefix.slice(0, -1);

  const knownUnderlyingMap: Record<string, string> = {
    PETR: "PETR4",
    VALE: "VALE3",
    ITUB: "ITUB4",
    BBDC: "BBDC4",
    BBAS: "BBAS3",
    ABEV: "ABEV3",
    MGLU: "MGLU3",
    WEGE: "WEGE3",
    BOVA: "BOVA11",
  };

  return knownUnderlyingMap[base] ?? "";
}

const normalCdf = (x: number) => {
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
};

const normalPdf = (x: number) =>
  Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

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

  return {
    price: Math.max(type === "CALL" ? call : put, 0),
    delta,
    gamma,
    vega,
    theta: (type === "CALL" ? thetaCall : thetaPut) / 365,
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
}) {
  const {
    spot,
    strike,
    marketPremium,
    riskFreeRate,
    dividendYield,
    daysToExpiration,
    type,
  } = params;

  if (spot <= 0 || strike <= 0 || marketPremium <= 0) {
    return null;
  }

  const intrinsicValue =
    type === "CALL"
      ? Math.max(spot - strike, 0)
      : Math.max(strike - spot, 0);

  if (marketPremium < intrinsicValue) {
    return null;
  }

  let lowVol = 0.0001;
  let highVol = 5;
  const tolerance = 0.0001;
  const maxIterations = 120;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const midVol = (lowVol + highVol) / 2;

    const result = blackScholes({
      spot,
      strike,
      volatility: midVol,
      riskFreeRate,
      dividendYield,
      daysToExpiration,
      type,
    });

    const difference = result.price - marketPremium;

    if (Math.abs(difference) < tolerance) {
      return midVol;
    }

    if (result.price > marketPremium) {
      highVol = midVol;
    } else {
      lowVol = midVol;
    }
  }

  return (lowVol + highVol) / 2;
}

export default function CalculatorPage() {
  const [optionCode, setOptionCode] = useState("");
  const [asset, setAsset] = useState("");
  const [spot, setSpot] = useState("");
  const [optionType, setOptionType] = useState<OptionTypeInput>("");
  const [strike, setStrike] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [marketPremium, setMarketPremium] = useState("");
  const [volatility, setVolatility] = useState("");
  const [riskFreeRate, setRiskFreeRate] = useState("10,5");
  const [dividendYield, setDividendYield] = useState("0");

  const [isLoadingOption, setIsLoadingOption] = useState(false);
  const [optionError, setOptionError] = useState("");
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [result, setResult] = useState<CalculationResult | null>(null);

  const daysToExpiration = useMemo(
    () => getDaysToExpiration(expirationDate),
    [expirationDate]
  );

  function clearOptionFields() {
    setAsset("");
    setSpot("");
    setOptionType("");
    setStrike("");
    setExpirationDate("");
    setMarketPremium("");
    setVolatility("");
    setResult(null);
  }

  async function handleSearchOption() {
    const cleanOptionCode = normalizeCode(optionCode);

    if (!cleanOptionCode) {
      alert("Informe o código da opção.");
      return;
    }

    try {
      setIsLoadingOption(true);
      setOptionError("");
      setResult(null);
      clearOptionFields();
      setOptionCode(cleanOptionCode);

      const response = await getOptionBySymbol(cleanOptionCode);

      console.log("[CalculatorPage] Dados da opção recebidos:", response);

      const rawAsset = findValueByKeys(response, UNDERLYING_KEYS);

      const foundAssetFromApi =
        typeof rawAsset === "string" ? rawAsset.trim().toUpperCase() : "";

      const foundAsset =
        foundAssetFromApi || inferUnderlyingFromOptionCode(cleanOptionCode);

      const foundType =
        parseOptionType(findValueByKeys(response, OPTION_TYPE_KEYS)) ||
        inferTypeFromOptionCode(cleanOptionCode);

      const foundStrike = parseDecimal(
        findValueByKeys(response, STRIKE_KEYS) as string | number | undefined
      );

      const foundMarketPremium = parseDecimal(
        findValueByKeys(response, OPTION_PRICE_KEYS) as
          | string
          | number
          | undefined
      );

      const foundExpirationDate = normalizeDateToInput(
        findValueByKeys(response, EXPIRATION_KEYS)
      );

      const foundSpotFromOption = parseDecimal(
        findValueByKeys(response, UNDERLYING_PRICE_KEYS) as
          | string
          | number
          | undefined
      );

      let foundSpot = foundSpotFromOption;

      if (foundSpot === null && foundAsset) {
        try {
          const quote = await getQuote(foundAsset);

          if (typeof quote?.price === "number") {
            foundSpot = quote.price;
          }
        } catch (error) {
          console.warn(
            `[CalculatorPage] Não foi possível buscar preço do ativo ${foundAsset}:`,
            error
          );
        }
      }

      setAsset(foundAsset || "");
      setOptionType(foundType || "");
      setStrike(foundStrike !== null ? formatInputNumber(foundStrike, 2) : "");
      setMarketPremium(
        foundMarketPremium !== null
          ? formatInputNumber(foundMarketPremium, 2)
          : ""
      );
      setExpirationDate(foundExpirationDate || "");
      setSpot(foundSpot !== null ? formatInputNumber(foundSpot, 2) : "");

      setLastLoadedAt(new Date());

      if (
        !foundAsset &&
        !foundType &&
        foundStrike === null &&
        foundMarketPremium === null &&
        !foundExpirationDate &&
        foundSpot === null
      ) {
        setOptionError(
          "A API respondeu, mas não encontrei os dados necessários. Preencha manualmente os campos em branco."
        );
      }
    } catch (error) {
      console.error("Erro ao buscar opção:", error);

      setOptionError(
        "Não foi possível buscar essa opção pela API. Preencha os dados manualmente."
      );

      setOptionType(inferTypeFromOptionCode(cleanOptionCode));
      setAsset(inferUnderlyingFromOptionCode(cleanOptionCode));
    } finally {
      setIsLoadingOption(false);
    }
  }

  function handleCalculate() {
    const parsedSpot = parseDecimal(spot);
    const parsedStrike = parseDecimal(strike);
    const parsedMarketPremium = parseDecimal(marketPremium);
    const parsedVolatility = parseDecimal(volatility);
    const parsedRiskFreeRate = parseDecimal(riskFreeRate) ?? 0;
    const parsedDividendYield = parseDecimal(dividendYield) ?? 0;

    const missingBaseFields: string[] = [];

    if (parsedSpot === null || parsedSpot <= 0) {
      missingBaseFields.push("preço atual do ativo");
    }

    if (parsedStrike === null || parsedStrike <= 0) {
      missingBaseFields.push("strike");
    }

    if (!optionType) {
      missingBaseFields.push("tipo da opção");
    }

    if (daysToExpiration === null) {
      missingBaseFields.push("vencimento");
    }

    const canUseBaseFields =
      missingBaseFields.length === 0 &&
      parsedSpot !== null &&
      parsedStrike !== null &&
      optionType !== "" &&
      daysToExpiration !== null;

    let theoreticalPrice: number | null = null;
    let impliedVolatility: number | null = null;
    let delta: number | null = null;
    let gamma: number | null = null;
    let vega: number | null = null;
    let theta: number | null = null;
    let greekSource = "";
    let error = "";

    if (canUseBaseFields) {
      const safeSpot = parsedSpot as number;
      const safeStrike = parsedStrike as number;
      const safeType = optionType as OptionType;
      const safeDaysToExpiration = daysToExpiration as number;

      if (parsedVolatility !== null && parsedVolatility > 0) {
        const bs = blackScholes({
          spot: safeSpot,
          strike: safeStrike,
          volatility: parsedVolatility / 100,
          riskFreeRate: parsedRiskFreeRate / 100,
          dividendYield: parsedDividendYield / 100,
          daysToExpiration: safeDaysToExpiration,
          type: safeType,
        });

        theoreticalPrice = bs.price;
        delta = bs.delta;
        gamma = bs.gamma;
        vega = bs.vega;
        theta = bs.theta;
        greekSource = "Volatilidade usada";
      }

      if (parsedMarketPremium !== null && parsedMarketPremium > 0) {
        impliedVolatility = calculateImpliedVolatility({
          spot: safeSpot,
          strike: safeStrike,
          marketPremium: parsedMarketPremium,
          riskFreeRate: parsedRiskFreeRate / 100,
          dividendYield: parsedDividendYield / 100,
          daysToExpiration: safeDaysToExpiration,
          type: safeType,
        });
      }

      if (
        theoreticalPrice === null &&
        impliedVolatility !== null &&
        impliedVolatility > 0
      ) {
        const bsByImpliedVolatility = blackScholes({
          spot: safeSpot,
          strike: safeStrike,
          volatility: impliedVolatility,
          riskFreeRate: parsedRiskFreeRate / 100,
          dividendYield: parsedDividendYield / 100,
          daysToExpiration: safeDaysToExpiration,
          type: safeType,
        });

        delta = bsByImpliedVolatility.delta;
        gamma = bsByImpliedVolatility.gamma;
        vega = bsByImpliedVolatility.vega;
        theta = bsByImpliedVolatility.theta;
        greekSource = "Volatilidade implícita";
      }
    }

    if (!canUseBaseFields) {
      error = `Preencha: ${missingBaseFields.join(", ")}.`;
    } else if (theoreticalPrice === null && impliedVolatility === null) {
      error =
        "Para calcular, informe a volatilidade usada ou o prêmio de mercado da opção.";
    } else if (theoreticalPrice === null) {
      error =
        "Preço teórico não calculado porque a volatilidade usada está em branco.";
    } else if (impliedVolatility === null) {
      error =
        "Volatilidade implícita não calculada porque o prêmio de mercado está em branco, zerado ou abaixo do valor intrínseco.";
    }

    const difference =
      theoreticalPrice !== null && parsedMarketPremium !== null
        ? parsedMarketPremium - theoreticalPrice
        : null;

    const differencePercent =
      difference !== null && theoreticalPrice !== null && theoreticalPrice > 0
        ? difference / theoreticalPrice
        : null;

    setResult({
      theoreticalPrice,
      impliedVolatility,
      difference,
      differencePercent,
      delta,
      gamma,
      vega,
      theta,
      greekSource,
      error,
    });
  }

  return (
    <Layout>
      <main style={styles.page}>
        <section style={styles.headerCard}>
          <div>
            <p style={styles.eyebrow}>Options Terminal</p>
            <h1 style={styles.title}>Calculadora de Opções</h1>
            <p style={styles.subtitle}>
              Informe o código da opção, busque os dados disponíveis na API e
              calcule o preço teórico pelo Black-Scholes, a volatilidade
              implícita pelo prêmio de mercado e as gregas.
            </p>
          </div>

          <div style={styles.headerActions}>
            {lastLoadedAt && (
              <span style={styles.lastLoaded}>
                Dados carregados às{" "}
                {lastLoadedAt.toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            )}

            <button
              type="button"
              style={styles.primaryButton}
              onClick={handleCalculate}
            >
              Calcular
            </button>
          </div>
        </section>

        <section style={styles.card}>
          <div style={styles.sectionHeader}>
            <div>
              <h2 style={styles.cardTitle}>Buscar opção</h2>
              <p style={styles.sectionText}>
                Digite o código da opção. Os campos que a API não encontrar
                ficam em branco para preenchimento manual.
              </p>
            </div>
          </div>

          <div style={styles.searchRow}>
            <input
              style={styles.searchInput}
              value={optionCode}
              placeholder="Ex: PETRG424"
              onChange={(event) => {
                setOptionCode(event.target.value.toUpperCase());
                setResult(null);
              }}
            />

            <button
              type="button"
              style={{
                ...styles.primaryButton,
                opacity: isLoadingOption ? 0.7 : 1,
              }}
              onClick={handleSearchOption}
              disabled={isLoadingOption}
            >
              {isLoadingOption ? "Buscando..." : "Buscar opção"}
            </button>
          </div>

          {optionError && <div style={styles.errorBox}>{optionError}</div>}
        </section>

        <section style={styles.grid}>
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Dados para o cálculo</h2>

            <div style={styles.formGrid}>
              <label style={styles.label}>
                Ativo
                <input
                  style={styles.input}
                  value={asset}
                  placeholder="Ex: PETR4"
                  onChange={(event) => {
                    setAsset(event.target.value.toUpperCase());
                    setResult(null);
                  }}
                />
              </label>

              <label style={styles.label}>
                Preço atual do ativo
                <input
                  style={styles.input}
                  value={spot}
                  type="text"
                  inputMode="decimal"
                  placeholder="Ex: 41,76"
                  onChange={(event) => {
                    setSpot(event.target.value);
                    setResult(null);
                  }}
                />
              </label>

              <label style={styles.label}>
                Tipo da opção
                <select
                  style={styles.input}
                  value={optionType}
                  onChange={(event) => {
                    setOptionType(event.target.value as OptionTypeInput);
                    setResult(null);
                  }}
                >
                  <option value="">Selecione</option>
                  <option value="CALL">Call</option>
                  <option value="PUT">Put</option>
                </select>
              </label>

              <label style={styles.label}>
                Strike
                <input
                  style={styles.input}
                  value={strike}
                  type="text"
                  inputMode="decimal"
                  placeholder="Ex: 42,36"
                  onChange={(event) => {
                    setStrike(event.target.value);
                    setResult(null);
                  }}
                />
              </label>

              <label style={styles.label}>
                Vencimento
                <input
                  style={styles.input}
                  value={expirationDate}
                  type="date"
                  onChange={(event) => {
                    setExpirationDate(event.target.value);
                    setResult(null);
                  }}
                />
              </label>

              <label style={styles.label}>
                Dias até o vencimento
                <input
                  style={{ ...styles.input, opacity: 0.7 }}
                  value={daysToExpiration ?? ""}
                  readOnly
                  placeholder="Automático"
                />
              </label>

              <label style={styles.label}>
                Prêmio de mercado
                <input
                  style={styles.input}
                  value={marketPremium}
                  type="text"
                  inputMode="decimal"
                  placeholder="Ex: 1,85"
                  onChange={(event) => {
                    setMarketPremium(event.target.value);
                    setResult(null);
                  }}
                />
              </label>

              <label style={styles.label}>
                Volatilidade usada %
                <input
                  style={styles.input}
                  value={volatility}
                  type="text"
                  inputMode="decimal"
                  placeholder="Ex: 35"
                  onChange={(event) => {
                    setVolatility(event.target.value);
                    setResult(null);
                  }}
                />
              </label>

              <label style={styles.label}>
                Taxa livre de risco anual %
                <input
                  style={styles.input}
                  value={riskFreeRate}
                  type="text"
                  inputMode="decimal"
                  placeholder="Ex: 10,5"
                  onChange={(event) => {
                    setRiskFreeRate(event.target.value);
                    setResult(null);
                  }}
                />
              </label>

              <label style={styles.label}>
                Dividend yield anual %
                <input
                  style={styles.input}
                  value={dividendYield}
                  type="text"
                  inputMode="decimal"
                  placeholder="Ex: 0"
                  onChange={(event) => {
                    setDividendYield(event.target.value);
                    setResult(null);
                  }}
                />
              </label>
            </div>

            <div style={styles.actionsRow}>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => {
                  clearOptionFields();
                  setOptionCode("");
                  setOptionError("");
                }}
              >
                Limpar
              </button>

              <button
                type="button"
                style={styles.primaryButton}
                onClick={handleCalculate}
              >
                Calcular
              </button>
            </div>
          </div>

          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Resultado</h2>

            <div style={styles.resultGrid}>
              <div style={styles.metricBox}>
                <span style={styles.metricLabel}>Preço teórico BS</span>
                <strong style={styles.metricValue}>
                  {result ? formatCurrency(result.theoreticalPrice, 4) : "—"}
                </strong>
                <small style={styles.metricHint}>
                  Usa a volatilidade preenchida no campo acima
                </small>
              </div>

              <div style={styles.metricBox}>
                <span style={styles.metricLabel}>Volatilidade implícita</span>
                <strong style={styles.metricValue}>
                  {result ? formatPercent(result.impliedVolatility) : "—"}
                </strong>
                <small style={styles.metricHint}>
                  Calculada a partir do prêmio de mercado
                </small>
              </div>

              <div style={styles.metricBox}>
                <span style={styles.metricLabel}>Mercado - Teórico</span>
                <strong style={styles.metricValue}>
                  {result ? formatCurrency(result.difference, 4) : "—"}
                </strong>
                <small style={styles.metricHint}>
                  Diferença em reais por opção
                </small>
              </div>

              <div style={styles.metricBox}>
                <span style={styles.metricLabel}>Diferença %</span>
                <strong style={styles.metricValue}>
                  {result
                    ? formatNumber(
                        result.differencePercent !== null
                          ? result.differencePercent * 100
                          : null,
                        2
                      )
                    : "—"}
                  {result?.differencePercent !== null && result ? "%" : ""}
                </strong>
                <small style={styles.metricHint}>Baseada no preço teórico</small>
              </div>

              <div style={styles.metricBox}>
                <span style={styles.metricLabel}>Delta</span>
                <strong style={styles.metricValue}>
                  {result ? formatNumber(result.delta, 4) : "—"}
                </strong>
                <small style={styles.metricHint}>
                  Variação da opção para R$ 1,00 no ativo
                </small>
              </div>

              <div style={styles.metricBox}>
                <span style={styles.metricLabel}>Gamma</span>
                <strong style={styles.metricValue}>
                  {result ? formatNumber(result.gamma, 6) : "—"}
                </strong>
                <small style={styles.metricHint}>
                  Quanto o delta muda quando o ativo varia
                </small>
              </div>

              <div style={styles.metricBox}>
                <span style={styles.metricLabel}>Vega</span>
                <strong style={styles.metricValue}>
                  {result ? formatNumber(result.vega, 4) : "—"}
                </strong>
                <small style={styles.metricHint}>
                  Impacto estimado de +1 p.p. na volatilidade
                </small>
              </div>

              <div style={styles.metricBox}>
                <span style={styles.metricLabel}>Theta diário</span>
                <strong style={styles.metricValue}>
                  {result ? formatCurrency(result.theta, 4) : "—"}
                </strong>
                <small style={styles.metricHint}>
                  Perda ou ganho teórico por dia
                </small>
              </div>

              <div style={styles.metricBox}>
                <span style={styles.metricLabel}>Base das gregas</span>
                <strong style={styles.metricValueSmall}>
                  {result?.greekSource || "—"}
                </strong>
                <small style={styles.metricHint}>
                  Usa a volatilidade informada; se estiver vazia, usa a implícita
                </small>
              </div>
            </div>

            {result?.error && <div style={styles.warningBox}>{result.error}</div>}

            <div style={styles.infoBox}>
              <strong>Leitura rápida</strong>
              <span>
                Se o prêmio de mercado estiver acima do preço teórico, a opção
                está mais cara que o modelo. Se estiver abaixo, está mais barata
                que o modelo. A volatilidade implícita mostra qual volatilidade o
                mercado está embutindo naquele prêmio.
              </span>
            </div>
          </div>
        </section>

        <section style={styles.warningBox}>
          <strong>Importante:</strong> Black-Scholes é apenas um modelo teórico.
          Ele não garante que a opção esteja cara ou barata de verdade.
          Liquidez, spread, dividendos, exercício, eventos e distorções de
          mercado podem alterar bastante o preço.
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
    gap: "16px",
    padding: "24px",
    borderRadius: "20px",
    border: "1px solid var(--border-color, rgba(148, 163, 184, 0.22))",
    background: "var(--bg-card, rgba(15, 23, 42, 0.92))",
  },

  headerActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "10px",
    flexWrap: "wrap",
  },

  lastLoaded: {
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
    fontSize: "32px",
    lineHeight: 1.1,
  },

  subtitle: {
    margin: 0,
    color: "var(--text-muted, #94a3b8)",
    maxWidth: "760px",
  },

  card: {
    padding: "22px",
    borderRadius: "20px",
    border: "1px solid var(--border-color, rgba(148, 163, 184, 0.22))",
    background: "var(--bg-card, rgba(15, 23, 42, 0.92))",
    boxShadow: "0 18px 50px rgba(0, 0, 0, 0.16)",
  },

  sectionHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "16px",
    marginBottom: "16px",
  },

  cardTitle: {
    margin: "0 0 8px",
    fontSize: "20px",
  },

  sectionText: {
    margin: 0,
    color: "var(--text-muted, #94a3b8)",
    fontSize: "14px",
  },

  searchRow: {
    display: "grid",
    gridTemplateColumns: "minmax(220px, 1fr) auto",
    gap: "12px",
    alignItems: "center",
  },

  searchInput: {
    width: "100%",
    minHeight: "46px",
    padding: "10px 14px",
    borderRadius: "14px",
    border: "1px solid var(--border-color, rgba(148, 163, 184, 0.28))",
    background: "var(--bg-main, #020617)",
    color: "var(--text-main, #e5e7eb)",
    outline: "none",
    fontSize: "16px",
    fontWeight: 700,
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.15fr) minmax(360px, 0.85fr)",
    gap: "24px",
  },

  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "14px",
  },

  label: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    color: "var(--text-muted, #94a3b8)",
    fontSize: "13px",
    fontWeight: 600,
  },

  input: {
    width: "100%",
    minHeight: "42px",
    padding: "10px 12px",
    borderRadius: "12px",
    border: "1px solid var(--border-color, rgba(148, 163, 184, 0.28))",
    background: "var(--bg-main, #020617)",
    color: "var(--text-main, #e5e7eb)",
    outline: "none",
  },

  actionsRow: {
    marginTop: "18px",
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    flexWrap: "wrap",
  },

  primaryButton: {
    border: 0,
    borderRadius: "12px",
    padding: "11px 16px",
    background: "var(--accent, #6366f1)",
    color: "#ffffff",
    fontWeight: 800,
    cursor: "pointer",
  },

  secondaryButton: {
    border: "1px solid var(--border-color, rgba(148, 163, 184, 0.28))",
    borderRadius: "12px",
    padding: "10px 12px",
    background: "transparent",
    color: "var(--text-main, #e5e7eb)",
    fontWeight: 700,
    cursor: "pointer",
  },

  errorBox: {
    marginTop: "14px",
    padding: "12px 14px",
    borderRadius: "14px",
    border: "1px solid rgba(248, 113, 113, 0.35)",
    background: "rgba(248, 113, 113, 0.1)",
    color: "#fecaca",
    fontSize: "14px",
  },

  warningBox: {
    padding: "14px",
    borderRadius: "16px",
    border: "1px solid rgba(234, 179, 8, 0.35)",
    background: "rgba(234, 179, 8, 0.1)",
    color: "#fde68a",
    fontSize: "14px",
    lineHeight: 1.5,
  },

  resultGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
  },

  metricBox: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "14px",
    borderRadius: "16px",
    background: "rgba(148, 163, 184, 0.08)",
  },

  metricLabel: {
    color: "var(--text-muted, #94a3b8)",
    fontSize: "12px",
  },

  metricValue: {
    fontSize: "22px",
  },

  metricValueSmall: {
    fontSize: "16px",
  },

  metricHint: {
    color: "var(--text-muted, #94a3b8)",
    fontSize: "12px",
  },

  infoBox: {
    marginTop: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "14px",
    borderRadius: "16px",
    background: "rgba(59, 130, 246, 0.1)",
    border: "1px solid rgba(59, 130, 246, 0.24)",
    color: "#bfdbfe",
    fontSize: "14px",
    lineHeight: 1.5,
  },
};
