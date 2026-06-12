import { useEffect, useMemo, useState } from "react";

import Layout from "../components/Layout/Layout";
import OperationCard from "../components/OperationCard";
import MarketPricesPanel from "../components/MarketPricesPanel";

import { useOperationsStore } from "../store/useOperationsStore";
import { getQuote } from "../services/marketData/marketDataService";

export default function OperationsPage() {
  const operations = useOperationsStore((state) => state.operations);
  const clearOperations = useOperationsStore((state) => state.clearOperations);
  const removeOperation = useOperationsStore((state) => state.removeOperation);

  const [apiPrices, setApiPrices] = useState<Record<string, number>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [pricesError, setPricesError] = useState("");

  const operationSymbols = useMemo(() => {
    const symbols = operations
      .map((operation) => operation.symbol?.trim().toUpperCase())
      .filter((symbol): symbol is string => Boolean(symbol));

    return Array.from(new Set(symbols));
  }, [operations]);

  useEffect(() => {
    if (operationSymbols.length === 0) {
      setApiPrices({});
      return;
    }

    let cancelled = false;

    async function loadPrices() {
      try {
        setLoadingPrices(true);
        setPricesError("");

        const results = await Promise.all(
          operationSymbols.map(async (symbol) => {
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

        const nextPrices: Record<string, number> = {};

        results.forEach((item) => {
          if (typeof item.price === "number") {
            nextPrices[item.symbol] = item.price;
          }
        });

        setApiPrices(nextPrices);
      } catch (error) {
        console.error("Erro ao carregar preços das operações:", error);

        if (!cancelled) {
          setPricesError("Não foi possível carregar os preços atuais da API.");
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
  }, [operationSymbols]);

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
          const symbol = operation.symbol.trim().toUpperCase();
          const currentPrice = apiPrices[symbol];

          return (
            <OperationCard
              key={operation.id}
              operation={operation}
              currentPrice={currentPrice ?? 0}
            />
          );
        })
      )}
    </Layout>
  );
}