import Layout from "../components/Layout/Layout";
import OperationCard from "../components/OperationCard";
import { useOperationsStore } from "../store/useOperationsStore";

export default function OperationsPage() {
  const operations = useOperationsStore((state) => state.operations);
  const clearOperations = useOperationsStore((state) => state.clearOperations);

  const currentPrices: Record<string, number> = {
    PETR4: 100,
    VALE3: 60,
    ITUB4: 35,
  };

  return (
    <Layout>
      <div className="page-header">
        <h2>💼 Carteira</h2>
        <p>Acompanhe suas operações salvas.</p>
      </div>

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
            currentPrice={currentPrices[operation.symbol] ?? 100}
          />
        ))
      )}
    </Layout>
  );
}