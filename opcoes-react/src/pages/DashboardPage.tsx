import Layout from "../components/Layout/Layout";
import MetricCard from "../components/MetricCard";
import OperationCard from "../components/OperationCard";
import type { Operation } from "../models/Operation";
import { calculatePortfolioMetrics } from "../services/portfolioMetrics";

function formatCurrency(value: number) {
  return `R$ ${value.toFixed(2)}`;
}

export default function DashboardPage() {
  const currentPrices: Record<string, number> = {
  PETR4: 100,
};

  const operations: Operation[] = [
    {
      id: "op-1",
      name: "Trava de Alta PETR4",
      symbol: "PETR4",
      createdAt: new Date().toISOString(),
      expirationDate: "2026-07-17",
      volatility: 0.25,
      riskFreeRate: 0.05,
      legs: [
        {
          id: "leg-1",
          direction: "buy",
          optionType: "call",
          strike: 100,
          premium: 5,
          quantity: 100,
        },
        {
          id: "leg-2",
          direction: "sell",
          optionType: "call",
          strike: 110,
          premium: 2,
          quantity: 100,
        },
      ],
    },
  ];

  const metrics = calculatePortfolioMetrics(operations, currentPrices, 30);

  return (
    <Layout>
      <h2>Dashboard</h2>

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

      {operations.map((operation) => (
        <OperationCard
          key={operation.id}
          operation={operation}
          currentPrice={currentPrices[operation.symbol]}
        />
      ))}
    </Layout>
  );
}