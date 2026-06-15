import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout/Layout";
import MetricCard from "../components/MetricCard";
import OperationCard from "../components/OperationCard";
import { useOperationsStore } from "../store/useOperationsStore";
import { useMarketDataStore } from "../store/useMarketDataStore";
import { calculatePortfolioMetrics } from "../services/portfolioMetrics";
import { getQuote } from "../services/marketData/marketDataService";
import MarketPricesPanel from "../components/MarketPricesPanel";

const PRICE_REFRESH_INTERVAL_MS = 60_000;

function formatCurrency(value: number) {
  return `R$ ${value.toFixed(2)}`;
}

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase().replace(/\.SA$/, "");
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const normalizedValue = trimmedValue.includes(",")
    ? trimmedValue.replace(/\./g, "").replace(",", ".")
    : trimmedValue;

  const parsedValue = Number(normalizedValue);

  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function extractQuotePrice(payload: unknown): number | null {
  const primitivePrice = toFiniteNumber(payload);

  if (primitivePrice !== null) {
    return primitivePrice;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const price = extractQuotePrice(item);

      if (price !== null) {
        return price;
      }
    }

    return null;
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const quote = payload as Record<string, unknown>;
  const priceKeys = [
    "price",
    "currentPrice",
    "lastPrice",
    "regularMarketPrice",
    "close",
  ];

  for (const key of priceKeys) {
    const price = toFiniteNumber(quote[key]);

    if (price !== null) {
      return price;
    }
  }

  const nestedKeys = ["data", "quote", "result"];

  for (const key of nestedKeys) {
    const price = extractQuotePrice(quote[key]);

    if (price !== null) {
      return price;
    }
  }

  return null;
}

export default function DashboardPage() {
  const operations = useOperationsStore((state) => state.operations);
  const removeOperation = useOperationsStore((state) => state.removeOperation);

  const prices = useMarketDataStore((state) => state.prices);
  const setPrice = useMarketDataStore((state) => state.setPrice);

  const [isUpdatingPrices, setIsUpdatingPrices] = useState(false);
  const [lastPriceUpdate, setLastPriceUpdate] = useState<Date | null>(null);
  const [priceUpdateError, setPriceUpdateError] = useState<string | null>(null);

  const operationSymbols = useMemo(
    () =>
      Array.from(
        new Set(
          operations
            .map((operation) => normalizeSymbol(operation.symbol))
            .filter(Boolean),
        ),
      ),
    [operations],
  );

  useEffect(() => {
    if (operationSymbols.length === 0) {
      setIsUpdatingPrices(false);
      setLastPriceUpdate(null);
      setPriceUpdateError(null);
      return;
    }

    let cancelled = false;
    let requestInProgress = false;

    async function updatePortfolioPrices() {
      if (requestInProgress) {
        return;
      }

      requestInProgress = true;

      if (!cancelled) {
        setIsUpdatingPrices(true);
        setPriceUpdateError(null);
      }

      try {
        const results = await Promise.allSettled(
          operationSymbols.map(async (symbol) => {
            const quote = await getQuote(symbol);
            const currentPrice = extractQuotePrice(quote);

            if (currentPrice === null || currentPrice <= 0) {
              throw new Error(`Cotação inválida para ${symbol}.`);
            }

            return {
              symbol,
              currentPrice,
            };
          }),
        );

        if (cancelled) {
          return;
        }

        const symbolsWithError: string[] = [];
        let updatedPricesCount = 0;

        results.forEach((result, index) => {
          const symbol = operationSymbols[index];

          if (result.status === "fulfilled") {
            setPrice(result.value.symbol, result.value.currentPrice);
            updatedPricesCount += 1;
          } else {
            symbolsWithError.push(symbol);
            console.error(
              `[DashboardPage] Erro ao atualizar a cotação de ${symbol}:`,
              result.reason,
            );
          }
        });

        if (updatedPricesCount > 0) {
          setLastPriceUpdate(new Date());
        }

        if (symbolsWithError.length > 0) {
          setPriceUpdateError(
            `Não foi possível atualizar: ${symbolsWithError.join(", ")}.`,
          );
        }
      } catch (error) {
        if (!cancelled) {
          console.error(
            "[DashboardPage] Erro ao atualizar os preços da carteira:",
            error,
          );
          setPriceUpdateError(
            "Não foi possível atualizar os preços da carteira.",
          );
        }
      } finally {
        requestInProgress = false;

        if (!cancelled) {
          setIsUpdatingPrices(false);
        }
      }
    }

    void updatePortfolioPrices();

    const intervalId = window.setInterval(() => {
      void updatePortfolioPrices();
    }, PRICE_REFRESH_INTERVAL_MS);

    const updateWhenPageBecomesActive = () => {
      if (document.visibilityState === "visible") {
        void updatePortfolioPrices();
      }
    };

    document.addEventListener("visibilitychange", updateWhenPageBecomesActive);
    window.addEventListener("focus", updateWhenPageBecomesActive);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener(
        "visibilitychange",
        updateWhenPageBecomesActive,
      );
      window.removeEventListener("focus", updateWhenPageBecomesActive);
    };
  }, [operationSymbols, setPrice]);

  const portfolioPrices = useMemo(() => {
    const normalizedPrices = { ...prices };

    operations.forEach((operation) => {
      const normalizedSymbol = normalizeSymbol(operation.symbol);
      const currentPrice =
        prices[normalizedSymbol] ?? prices[operation.symbol] ?? null;

      if (currentPrice !== null) {
        normalizedPrices[operation.symbol] = currentPrice;
        normalizedPrices[normalizedSymbol] = currentPrice;
      }
    });

    return normalizedPrices;
  }, [operations, prices]);

  const metrics = calculatePortfolioMetrics(operations, portfolioPrices, 30);

  return (
    <Layout>
      <div className="page-header">
        <h2>📈 Dashboard</h2>
        <p>Resumo da carteira e operações abertas.</p>

        {operationSymbols.length > 0 && (
          <p
            style={{
              marginTop: 6,
              fontSize: 13,
              opacity: 0.75,
            }}
          >
            {isUpdatingPrices
              ? "Atualizando cotações..."
              : lastPriceUpdate
                ? `Cotações atualizadas às ${lastPriceUpdate.toLocaleTimeString(
                    "pt-BR",
                    {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    },
                  )}`
                : "Aguardando atualização das cotações..."}
            {priceUpdateError ? ` ${priceUpdateError}` : ""}
          </p>
        )}
      </div>

      <div className="metrics-grid">
        <MetricCard
          label="P&L Total"
          value={formatCurrency(metrics.pnl)}
          tone={metrics.pnl >= 0 ? "positive" : "negative"}
        />

        <MetricCard
          label="Valor BS"
          value={formatCurrency(metrics.theoreticalValue)}
        />

        <MetricCard label="Delta" value={metrics.delta.toFixed(2)} />

        <MetricCard label="Theta/dia" value={metrics.theta.toFixed(2)} />

        <MetricCard label="Gamma" value={metrics.gamma.toFixed(4)} />

        <MetricCard label="Vega" value={metrics.vega.toFixed(2)} />
      </div>

      <MarketPricesPanel />

      <section className="dashboard-section">
        <div className="section-title-row">
          <h3>Operações abertas</h3>
          <span>{operations.length} operação(ões)</span>
        </div>

        {operations.length === 0 ? (
          <div className="empty-box">
            Nenhuma operação salva ainda. Crie uma em “Nova Operação”.
          </div>
        ) : (
          operations.map((operation) => {
            const normalizedSymbol = normalizeSymbol(operation.symbol);
           const currentPrice =
  portfolioPrices[operation.symbol] ??
  portfolioPrices[normalizedSymbol] ??
  0;
            return (
              <OperationCard
                key={operation.id}
                operation={operation}
                currentPrice={currentPrice}
                onDelete={removeOperation}
              />
            );
          })
        )}
      </section>
    </Layout>
  );
}
