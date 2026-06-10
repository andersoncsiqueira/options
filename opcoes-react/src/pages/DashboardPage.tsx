import Layout from "../components/Layout/Layout";
import MetricCard from "../components/MetricCard";
import OperationCard from "../components/OperationCard";
import { useOperationsStore } from "../store/useOperationsStore";
import { useMarketDataStore } from "../store/useMarketDataStore";
import { calculatePortfolioMetrics } from "../services/portfolioMetrics";
import MarketPricesPanel from "../components/MarketPricesPanel";

function formatCurrency(value: number) {
  return `R$ ${value.toFixed(2)}`;
}

export default function DashboardPage() {
  const operations = useOperationsStore((state) => state.operations);
  const removeOperation = useOperationsStore((state) => state.removeOperation);

  const prices = useMarketDataStore((state) => state.prices);

  const metrics = calculatePortfolioMetrics(operations, prices, 30);

  return (
    <Layout>
      <div className="page-header">
        <h2>📈 Dashboard</h2>
        <p>Resumo da carteira e operações abertas.</p>
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
          operations.map((operation) => (
            <OperationCard
              key={operation.id}
              operation={operation}
              currentPrice={prices[operation.symbol] ?? 100}
              onDelete={removeOperation}
            />
          ))
        )}
      </section>
    </Layout>
  );
}