import { useEffect, useMemo, useState } from "react";

import Layout from "../components/Layout/Layout";
import OperationCard from "../components/OperationCard";
import MarketPricesPanel from "../components/MarketPricesPanel";

import { useOperationsStore } from "../store/useOperationsStore";
import { getQuote } from "../services/marketData/marketDataService";

type QuotePrices = Record<string, number>;

type LegWithMarketData = {
  optionSymbol?: string;
  symbol?: string;
  code?: string;
  ticker?: string;
  lastPrice?: number;
};

function normalizeSymbol(value: unknown) {
  if (typeof value !== "string") return "";

  return value.trim().toUpperCase();
}

function getLegOptionSymbol(leg: LegWithMarketData) {
  return (
    normalizeSymbol(leg.optionSymbol) ||
    normalizeSymbol(leg.symbol) ||
    normalizeSymbol(leg.code) ||
    normalizeSymbol(leg.ticker)
  );
}

export default function OperationsPage() {
  const operations = useOperationsStore((state) => state.operations);
  const clearOperations = useOperationsStore((state) => state.clearOperations);

  const [apiPrices, setApiPrices] = useState<QuotePrices>({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [pricesError, setPricesError] = useState("");

  const quoteSymbols = useMemo(() => {
    const symbols = new Set<string>();

    operations.forEach((operation) => {
      const operationSymbol = normalizeSymbol(operation.symbol);

      if (operationSymbol) {
        symbols.add(operationSymbol);
      }

      operation.legs.forEach((leg) => {
        const optionSymbol = getLegOptionSymbol(leg as LegWithMarketData);

        if (optionSymbol) {
          symbols.add(optionSymbol);
        }
      });
    });

    return Array.from(symbols);
  }, [operations]);

  useEffect(() => {
    if (quoteSymbols.length === 0) {
      setApiPrices({});
      return;
    }

    let cancelled = false;

    async function loadPrices() {
      try {
        setLoadingPrices(true);
        setPricesError("");

        const results = await Promise.all(
          quoteSymbols.map(async (symbol) => {
            try {
              const quote = await getQuote(symbol);

              return {
                symbol,
                price: quote?.price,
              };
            } catch (error) {
              console.error(`Erro ao buscar preço de ${symbol}:`, error);

              return {
                symbol,
                price: undefined,
              };
            }
          })
        );

        if (cancelled) return;

        const nextPrices: QuotePrices = {};

        results.forEach((item) => {
          if (typeof item.price === "number" && Number.isFinite(item.price)) {
            nextPrices[item.symbol] = item.price;
          }
        });

        setApiPrices(nextPrices);
      } catch (error) {
        console.error("Erro ao carregar preços das operações:", error);

        if (!cancelled) {
          setPricesError(
            "Não foi possível carregar os preços atuais dos ativos e opções pela API."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingPrices(false);
        }
      }
    }

    loadPrices();

    return () => {
      cancelled = true;
    };
  }, [quoteSymbols]);

  return (
    <Layout>
      <div className="page-header">
        <h2>💼 Carteira</h2>
        <p>Acompanhe suas operações salvas com preços reais da API.</p>
      </div>

      <MarketPricesPanel />

      {loadingPrices && (
        <div className="empty-box">Atualizando preços pela API...</div>
      )}

      {pricesError && <div className="empty-box">{pricesError}</div>}

      {operations.length > 0 && (
        <div className="actions-row">
          <button className="btn-secondary" onClick={clearOperations}>
            Limpar carteira
          </button>
        </div>
      )}

      {operations.length === 0 ? (
        <div className="empty-box">
          Nenhuma operação salva ainda. Crie uma em “Nova Operação”.
        </div>
      ) : (
        operations.map((operation) => {
          const operationSymbol = normalizeSymbol(operation.symbol);
          const currentPrice = apiPrices[operationSymbol];

          const operationWithUpdatedLegPrices = {
            ...operation,
            legs: operation.legs.map((leg) => {
              const optionSymbol = getLegOptionSymbol(leg as LegWithMarketData);
              const lastPrice = optionSymbol ? apiPrices[optionSymbol] : undefined;

              return {
                ...leg,
                optionSymbol,
                lastPrice,
              };
            }),
          };

          return (
            <OperationCard
              key={operation.id}
              operation={operationWithUpdatedLegPrices}
              currentPrice={currentPrice ?? 0}
            />
          );
        })
      )}
    </Layout>
  );
}