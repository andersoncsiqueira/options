import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import Layout from "../components/Layout/Layout";

import {
  getHistory,
  getQuote,
} from "../services/marketData/marketDataService";

import {
  getOptionBySymbol,
  getOptionHistory,
} from "../services/optionsMarketApi";

import type {
  HistoricalCandle,
  HistoryRange,
  Quote,
} from "../services/marketData/marketData.types";

import "../styles/asset-analysis.css";

type Period = "week" | "month" | "year";
type AnalysisKind = "asset" | "option";

const WEEKLY_BUY_VOLUME_PRICE_BUCKET = 0.1;

type ApiRecord = Record<string, unknown>;

type VolatilityPoint = {
  date: string;
  volatilityPercent: number;
  volatilityFinancial: number;
};

type WeeklyVolumePricePoint = {
  priceRange: string;
  buyVolume: number;
  averagePrice: number;
};

type ImportantDate = {
  id: string;
  date: string;
  title: string;
  type: "options" | "earnings" | "dividend" | "event";
  description: string;
};

type AssetAnalytics = {
  symbol: string;
  kind: AnalysisKind;
  quote: Quote | null;
  currentPrice: number;
  previousPrice: number;
  dailyChange: number;
  dailyChangePercent: number;
  annualizedVolatility: number;
  candles: HistoricalCandle[];
  volatilitySeries: VolatilityPoint[];
  weeklyBuyVolumeByPrice: WeeklyVolumePricePoint[];
  importantDates: ImportantDate[];
};

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

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("pt-BR");
}

function getPeriodLabel(period: Period): string {
  if (period === "week") return "Semana";
  if (period === "month") return "Mês";

  return "Ano";
}

function getHistoryRangeByPeriod(period: Period): HistoryRange {
  if (period === "week") return "1w";
  if (period === "month") return "1m";

  return "1y";
}

function detectAnalysisKind(symbol: string): AnalysisKind {
  const cleanSymbol = symbol.trim().toUpperCase();

  // Ativo: PETR4, VALE3, BBAS3 etc.
  // Opção: PETRF429, VALEF600 etc.
  if (/^[A-Z]{4}[A-Z]\d+/.test(cleanSymbol)) {
    return "option";
  }

  return "asset";
}

function average(values: number[]): number {
  if (values.length === 0) return 0;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;

  const avg = average(values);

  const variance =
    values.reduce((sum, value) => {
      return sum + Math.pow(value - avg, 2);
    }, 0) /
    (values.length - 1);

  return Math.sqrt(variance);
}

function calculateLogReturns(candles: HistoricalCandle[]): number[] {
  const returns: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const previousClose = candles[i - 1].close;
    const currentClose = candles[i].close;

    if (previousClose > 0 && currentClose > 0) {
      returns.push(Math.log(currentClose / previousClose));
    }
  }

  return returns;
}

function calculateAnnualizedVolatility(candles: HistoricalCandle[]): number {
  const returns = calculateLogReturns(candles);
  const dailyVolatility = standardDeviation(returns);

  return dailyVolatility * Math.sqrt(252);
}

function calculateVolatilitySeries(
  candles: HistoricalCandle[],
  windowSize = 21
): VolatilityPoint[] {
  const result: VolatilityPoint[] = [];

  if (candles.length < windowSize + 1) {
    return result;
  }

  for (let i = windowSize; i < candles.length; i++) {
    const windowCandles = candles.slice(i - windowSize, i + 1);
    const annualizedVolatility = calculateAnnualizedVolatility(windowCandles);
    const close = candles[i].close;

    result.push({
      date: candles[i].date,
      volatilityPercent: Number((annualizedVolatility * 100).toFixed(2)),
      volatilityFinancial: Number((close * annualizedVolatility).toFixed(2)),
    });
  }

  return result;
}

function unwrapArray(raw: unknown): unknown[] {
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

function unwrapObject(raw: unknown): ApiRecord {
  if (!isRecord(raw)) return {};

  if (isRecord(raw.data)) return raw.data;
  if (isRecord(raw.option)) return raw.option;
  if (isRecord(raw.quote)) return raw.quote;

  return raw;
}

function normalizeOptionQuote(
  raw: unknown,
  fallbackSymbol: string
): Quote | null {
  const data = unwrapObject(raw);

  const price =
    toNumber(data.price) ??
    toNumber(data.lastPrice) ??
    toNumber(data.currentPrice) ??
    toNumber(data.close) ??
    toNumber(data.regularMarketPrice) ??
    toNumber(data.premium) ??
    toNumber(data.bid) ??
    toNumber(data.ask);

  if (price === undefined) {
    return null;
  }

  return {
    symbol: String(data.symbol ?? data.code ?? fallbackSymbol).toUpperCase(),
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

function normalizeOptionHistory(raw: unknown): HistoricalCandle[] {
  const rawCandles = unwrapArray(raw);
  const candles: HistoricalCandle[] = [];

  rawCandles.forEach((rawItem) => {
    if (!isRecord(rawItem)) return;

    const close =
      toNumber(rawItem.close) ??
      toNumber(rawItem.price) ??
      toNumber(rawItem.lastPrice) ??
      toNumber(rawItem.premium) ??
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

function calculateWeeklyBuyVolumeByPrice(
  candles: HistoricalCandle[]
): WeeklyVolumePricePoint[] {
  const lastSevenCandles = candles.slice(-7);
  const buckets = new Map<
    number,
    { buyVolume: number; totalPrice: number; count: number }
  >();

  lastSevenCandles.forEach((candle) => {
    const volume = candle.volume ?? 0;

    if (volume <= 0) return;

    const positivePriceMove = candle.close >= candle.open;
    const buyVolume = positivePriceMove ? volume : volume * 0.45;
    const bucketPriceIndex = Math.floor(
      candle.close / WEEKLY_BUY_VOLUME_PRICE_BUCKET
    );
    const bucket = buckets.get(bucketPriceIndex) ?? {
      buyVolume: 0,
      totalPrice: 0,
      count: 0,
    };

    bucket.buyVolume += buyVolume;
    bucket.totalPrice += candle.close;
    bucket.count += 1;
    buckets.set(bucketPriceIndex, bucket);
  });

  return Array.from(buckets.entries())
    .sort(([priceA], [priceB]) => priceA - priceB)
    .map(([priceIndex, bucket]) => {
      const price = priceIndex * WEEKLY_BUY_VOLUME_PRICE_BUCKET;
      const nextPrice = price + WEEKLY_BUY_VOLUME_PRICE_BUCKET;

      return {
        priceRange: `${formatCurrency(price)} - ${formatCurrency(nextPrice)}`,
        buyVolume: Math.round(bucket.buyVolume),
        averagePrice: Number((bucket.totalPrice / bucket.count).toFixed(2)),
      };
    });
}

function generateImportantDates(
  symbol: string,
  kind: AnalysisKind
): ImportantDate[] {
  const today = new Date();

  if (kind === "option") {
    return [
      {
        id: "1",
        date: new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate() + 1
        )
          .toISOString()
          .slice(0, 10),
        title: "Revisar prêmio",
        type: "event",
        description:
          "Comparar prêmio de mercado com preço teórico, liquidez, spread e volatilidade implícita.",
      },
      {
        id: "2",
        date: new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate() + 5
        )
          .toISOString()
          .slice(0, 10),
        title: "Acompanhar vencimento",
        type: "options",
        description: `Conferir vencimento, liquidez e risco da opção ${symbol}.`,
      },
    ];
  }

  return [
    {
      id: "1",
      date: new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + 5
      )
        .toISOString()
        .slice(0, 10),
      title: "Vencimento de opções",
      type: "options",
      description: `Data importante para opções de ${symbol}. Conferir se é série semanal ou mensal.`,
    },
    {
      id: "2",
      date: new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + 12
      )
        .toISOString()
        .slice(0, 10),
      title: "Possível evento de proventos",
      type: "dividend",
      description:
        "Acompanhar comunicados de dividendos, JCP, data-com e data-ex.",
    },
    {
      id: "3",
      date: new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + 20
      )
        .toISOString()
        .slice(0, 10),
      title: "Resultado / balanço",
      type: "earnings",
      description:
        "Resultados financeiros podem alterar a volatilidade do ativo e das opções.",
    },
    {
      id: "4",
      date: new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + 30
      )
        .toISOString()
        .slice(0, 10),
      title: "Revisar volatilidade",
      type: "event",
      description:
        "Comparar volatilidade histórica do ativo com volatilidade implícita das opções.",
    },
  ];
}

async function getAssetAnalytics(
  symbol: string,
  period: Period
): Promise<AssetAnalytics> {
  const cleanSymbol = symbol.trim().toUpperCase();
  const range = getHistoryRangeByPeriod(period);
  const kind = detectAnalysisKind(cleanSymbol);

  let quote: Quote | null;
  let candles: HistoricalCandle[];

  if (kind === "option") {
    const [optionQuoteRaw, optionHistoryRaw] = await Promise.all([
      getOptionBySymbol(cleanSymbol),
      getOptionHistory(cleanSymbol, range),
    ]);

    quote = normalizeOptionQuote(optionQuoteRaw, cleanSymbol);
    candles = normalizeOptionHistory(optionHistoryRaw);
  } else {
    const [assetQuote, assetCandles] = await Promise.all([
      getQuote(cleanSymbol),
      getHistory(cleanSymbol, range),
    ]);

    quote = assetQuote;
    candles = assetCandles;
  }

  if (!quote && candles.length === 0) {
    throw new Error(`Nenhum dado encontrado para ${cleanSymbol}.`);
  }

  const lastCandle = candles[candles.length - 1];
  const previousCandle = candles[candles.length - 2];

  const currentPrice = quote?.price ?? lastCandle?.close ?? 0;
  const previousPrice = previousCandle?.close ?? currentPrice;

  const dailyChange = quote?.change ?? currentPrice - previousPrice;

  const dailyChangePercent =
    quote?.changePercent ??
    (previousPrice ? (dailyChange / previousPrice) * 100 : 0);

  const annualizedVolatility = calculateAnnualizedVolatility(candles);
  const volatilitySeries = calculateVolatilitySeries(candles, 21);
  const weeklyBuyVolumeByPrice =
    kind === "asset" ? calculateWeeklyBuyVolumeByPrice(candles) : [];

  return {
    symbol: cleanSymbol,
    kind,
    quote,
    currentPrice,
    previousPrice,
    dailyChange,
    dailyChangePercent,
    annualizedVolatility,
    candles,
    volatilitySeries,
    weeklyBuyVolumeByPrice,
    importantDates: generateImportantDates(cleanSymbol, kind),
  };
}

export default function AssetAnalysisPage() {
  const [symbol, setSymbol] = useState("PETR4");
  const [inputSymbol, setInputSymbol] = useState("PETR4");
  const [period, setPeriod] = useState<Period>("year");
  const [analytics, setAnalytics] = useState<AssetAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadAssetData(assetSymbol: string, selectedPeriod: Period) {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const data = await getAssetAnalytics(assetSymbol, selectedPeriod);

      setAnalytics(data);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);

      setAnalytics(null);
      setErrorMessage(
        "Não foi possível carregar os dados. Verifique o código digitado."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadAssetData(symbol, period);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [symbol, period]);

  const periodVolatility = useMemo(() => {
    if (!analytics || analytics.candles.length < 2) return 0;

    return calculateAnnualizedVolatility(analytics.candles);
  }, [analytics]);

  const periodFinancialVolatility = useMemo(() => {
    if (!analytics) return 0;

    return analytics.currentPrice * periodVolatility;
  }, [analytics, periodVolatility]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const cleanSymbol = inputSymbol.trim().toUpperCase();

    if (!cleanSymbol) return;

    setSymbol(cleanSymbol);
  }

  return (
    <Layout>
      <main className="asset-page">
        <section className="asset-header">
          <div>
            <span className="asset-eyebrow">
              {analytics?.kind === "option" ? "Opção" : "Ativo principal"}
            </span>

            <h1>
              {analytics?.kind === "option"
                ? "Análise da opção"
                : "Análise do ativo"}
            </h1>

            <p>
              Histórico de preço, volatilidade percentual, volatilidade
              financeira e calendário de datas relevantes para operações com
              opções.
            </p>
          </div>

          <form className="asset-search" onSubmit={handleSubmit}>
            <input
              value={inputSymbol}
              onChange={(event) =>
                setInputSymbol(event.target.value.toUpperCase())
              }
              placeholder="Ex: PETR4 ou PETRF429"
            />

            <button type="submit">Buscar</button>
          </form>
        </section>

        {isLoading && <div className="asset-loading">Carregando dados...</div>}

        {!isLoading && errorMessage && (
          <div className="asset-loading">{errorMessage}</div>
        )}

        {!isLoading && !errorMessage && analytics && (
          <>
            <section className="asset-summary-grid">
              <article className="asset-card">
                <span>{analytics.kind === "option" ? "Opção" : "Ativo"}</span>
                <strong>{analytics.symbol}</strong>
              </article>

              <article className="asset-card">
                <span>
                  {analytics.kind === "option" ? "Prêmio atual" : "Preço atual"}
                </span>
                <strong>{formatCurrency(analytics.currentPrice)}</strong>
              </article>

              <article className="asset-card">
                <span>Variação diária</span>

                <strong
                  className={
                    analytics.dailyChange >= 0 ? "positive" : "negative"
                  }
                >
                  {analytics.dailyChange >= 0 ? "+" : ""}
                  {formatCurrency(analytics.dailyChange)}
                </strong>

                <small
                  className={
                    analytics.dailyChangePercent >= 0 ? "positive" : "negative"
                  }
                >
                  {analytics.dailyChangePercent >= 0 ? "+" : ""}
                  {formatPercent(analytics.dailyChangePercent)}
                </small>
              </article>

              <article className="asset-card">
                <span>Volatilidade anualizada</span>
                <strong>
                  {formatPercent(analytics.annualizedVolatility * 100)}
                </strong>
                <small>Baseada no período selecionado</small>
              </article>

              {analytics.kind === "asset" && (
                <>
                  <article className="asset-card asset-card-highlight">
                    <span>Último preço</span>
                    <strong>{formatCurrency(analytics.currentPrice)}</strong>
                    <small>Cotação mais recente do ativo</small>
                  </article>

                  <article className="asset-card">
                    <span>Bid</span>
                    <strong>
                      {analytics.quote?.bid !== undefined
                        ? formatCurrency(analytics.quote.bid)
                        : "—"}
                    </strong>
                    <small>Melhor oferta de compra</small>
                  </article>

                  <article className="asset-card">
                    <span>Ask</span>
                    <strong>
                      {analytics.quote?.ask !== undefined
                        ? formatCurrency(analytics.quote.ask)
                        : "—"}
                    </strong>
                    <small>Melhor oferta de venda</small>
                  </article>
                </>
              )}
            </section>

            <section className="asset-period-card">
              <div>
                <h2>Período de análise</h2>

                <p>
                  Os gráficos abaixo usam o mesmo período selecionado: semana,
                  mês ou ano.
                </p>
              </div>

              <div className="asset-period-buttons">
                <button
                  type="button"
                  className={period === "week" ? "active" : ""}
                  onClick={() => setPeriod("week")}
                >
                  Semana
                </button>

                <button
                  type="button"
                  className={period === "month" ? "active" : ""}
                  onClick={() => setPeriod("month")}
                >
                  Mês
                </button>

                <button
                  type="button"
                  className={period === "year" ? "active" : ""}
                  onClick={() => setPeriod("year")}
                >
                  Ano
                </button>
              </div>
            </section>

            <section className="asset-chart-card">
              <div className="asset-chart-header">
                <div>
                  <h2>
                    Histórico{" "}
                    {analytics.kind === "option" ? "da opção" : "do ativo"} —{" "}
                    {getPeriodLabel(period)}
                  </h2>

                  <p>Preço de fechamento diário de {analytics.symbol}.</p>
                </div>
              </div>

              <div className="asset-chart-wrapper">
                {analytics.candles.length === 0 ? (
                  <div className="asset-loading">
                    Não há histórico suficiente para montar o gráfico.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={340}>
                    <AreaChart data={analytics.candles}>
                      <CartesianGrid strokeDasharray="3 3" />

                      <XAxis dataKey="date" minTickGap={32} />

                      <YAxis
                        domain={["auto", "auto"]}
                        tickFormatter={(value) => `R$ ${value}`}
                      />

                      <Tooltip
                        formatter={(value) => [
                          formatCurrency(Number(value)),
                          "Fechamento",
                        ]}
                        labelFormatter={(label) =>
                          `Data: ${formatDate(String(label))}`
                        }
                      />

                      <Area
                        type="monotone"
                        dataKey="close"
                        name="Fechamento"
                        strokeWidth={2}
                        fillOpacity={0.2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            {analytics.kind === "asset" && (
              <section className="asset-chart-card asset-volume-card">
                <div className="asset-chart-header">
                  <div>
                    <h2>Volume comprador por faixa de preço</h2>

                    <p>
                      Preços agrupados a cada R$ 0,10 com maior volume comprador
                      estimado na última semana.
                    </p>
                  </div>
                </div>

                <div className="asset-chart-wrapper">
                  {analytics.weeklyBuyVolumeByPrice.length === 0 ? (
                    <div className="asset-loading">
                      Não há volume suficiente para montar o gráfico semanal.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={340}>
                      <BarChart data={analytics.weeklyBuyVolumeByPrice}>
                        <CartesianGrid strokeDasharray="3 3" />

                        <XAxis dataKey="priceRange" minTickGap={16} />

                        <YAxis
                          tickFormatter={(value) =>
                            Number(value).toLocaleString("pt-BR", {
                              notation: "compact",
                            })
                          }
                        />

                        <Tooltip
                          formatter={(value, name) => [
                            Number(value).toLocaleString("pt-BR"),
                            name,
                          ]}
                        />

                        <Bar
                          dataKey="buyVolume"
                          name="Volume comprador estimado"
                          radius={[8, 8, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </section>
            )}

            <section className="asset-chart-card">
              <div className="asset-chart-header">
                <div>
                  <h2>Volatilidade — {getPeriodLabel(period)}</h2>

                  <p>
                    Volatilidade em percentual e em valor financeiro aproximado.
                  </p>
                </div>
              </div>

              <div className="asset-vol-summary">
                <div>
                  <span>Volatilidade percentual no período</span>
                  <strong>{formatPercent(periodVolatility * 100)}</strong>
                </div>

                <div>
                  <span>Volatilidade financeira estimada</span>
                  <strong>{formatCurrency(periodFinancialVolatility)}</strong>
                </div>
              </div>

              <div className="asset-chart-wrapper">
                {analytics.volatilitySeries.length === 0 ? (
                  <div className="asset-loading">
                    Não há dados suficientes para calcular volatilidade nesse
                    período.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={340}>
                    <LineChart data={analytics.volatilitySeries}>
                      <CartesianGrid strokeDasharray="3 3" />

                      <XAxis dataKey="date" minTickGap={32} />

                      <YAxis
                        yAxisId="percent"
                        orientation="left"
                        tickFormatter={(value) => `${value}%`}
                      />

                      <YAxis
                        yAxisId="financial"
                        orientation="right"
                        tickFormatter={(value) => `R$ ${value}`}
                      />

                      <Tooltip
                        formatter={(value, name) => {
                          if (name === "Volatilidade %") {
                            return [`${Number(value).toFixed(2)}%`, name];
                          }

                          return [formatCurrency(Number(value)), name];
                        }}
                        labelFormatter={(label) =>
                          `Data: ${formatDate(String(label))}`
                        }
                      />

                      <Legend />

                      <Line
                        yAxisId="percent"
                        type="monotone"
                        dataKey="volatilityPercent"
                        name="Volatilidade %"
                        strokeWidth={2}
                        dot={false}
                      />

                      <Line
                        yAxisId="financial"
                        type="monotone"
                        dataKey="volatilityFinancial"
                        name="Volatilidade em R$"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            <section className="asset-calendar-card">
              <div className="asset-chart-header">
                <div>
                  <h2>
                    Calendário{" "}
                    {analytics.kind === "option" ? "da opção" : "do ativo"}
                  </h2>

                  <p>
                    Datas que podem afetar preço, volatilidade e prêmio das
                    opções.
                  </p>
                </div>
              </div>

              <div className="asset-calendar-list">
                {analytics.importantDates.map((item) => (
                  <article
                    key={item.id}
                    className={`asset-calendar-item ${item.type}`}
                  >
                    <div className="asset-calendar-date">
                      <strong>{formatDate(item.date)}</strong>
                      <span>{item.type}</span>
                    </div>

                    <div>
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </Layout>
  );
}