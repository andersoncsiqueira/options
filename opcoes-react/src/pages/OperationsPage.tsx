import Layout from "../components/Layout/Layout";
import OperationCard from "../components/OperationCard";
import MarketPricesPanel from "../components/MarketPricesPanel";
import { useOperationsStore } from "../store/useOperationsStore";
import { useMarketDataStore } from "../store/useMarketDataStore";

export default function OperationsPage() {
  const operations = useOperationsStore((state) => state.operations);
  const clearOperations = useOperationsStore((state) => state.clearOperations);
  const removeOperation = useOperationsStore((state) => state.removeOperation);

  const prices = useMarketDataStore((state) => state.prices);

  return (
    <Layout>
      <div className="page-header">
        <h2>💼 Carteira</h2>
        <p>Acompanhe suas operações salvas e simule os preços dos ativos.</p>
      </div>

      <MarketPricesPanel />

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
        operations.map((operation) => (
          <OperationCard
            key={operation.id}
            operation={operation}
            currentPrice={prices[operation.symbol] ?? 100}
            onDelete={removeOperation}
          />
        ))
      )}
    </Layout>
  );
}