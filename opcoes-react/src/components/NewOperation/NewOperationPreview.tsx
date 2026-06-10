import PayoffChart from "../PayoffChart";
import { useOperationDraftStore } from "../../store/useOperationDraftStore";
import { buildOperationViewModel } from "../../viewModels/OperationFactory";
import type { Operation } from "../../models/Operation";

function formatCurrency(value: number) {
  return `R$ ${value.toFixed(2)}`;
}

function getDaysToExpiration(expirationDate: string) {
  if (!expirationDate) return 30;

  const today = new Date();
  const expiration = new Date(expirationDate);

  const diff = expiration.getTime() - today.getTime();

  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default function NewOperationPreview() {
  const draft = useOperationDraftStore();

  const currentPrice = 100;
  const daysToExpiration = getDaysToExpiration(draft.expirationDate);

  const operation: Operation = {
    id: "draft",
    name: draft.name || "Operação em montagem",
    symbol: draft.symbol || "PETR4",
    createdAt: new Date().toISOString(),
    expirationDate: draft.expirationDate || "sem vencimento",
    volatility: draft.volatility,
    riskFreeRate: draft.riskFreeRate,
    legs: draft.legs,
  };

  const vm = buildOperationViewModel(
    operation,
    currentPrice,
    daysToExpiration
  );

  return (
    <aside className="preview-panel">
      <h3>Preview em tempo real</h3>

      <div className="preview-price">
        <span>Preço atual simulado</span>
        <strong>R$ {currentPrice.toFixed(2)}</strong>
      </div>

      <div className="pricing-grid preview-grid">
        <div className="pricing-box">
          <span>Mercado</span>
          <strong>{formatCurrency(vm.negotiatedValue)}</strong>
        </div>

        <div className="pricing-box">
          <span>Black-Scholes</span>
          <strong>{formatCurrency(vm.theoreticalValue)}</strong>
        </div>

        <div className="pricing-box">
          <span>Diferença</span>
          <strong className={vm.mispricing >= 0 ? "positive" : "negative"}>
            {formatCurrency(vm.mispricing)}
          </strong>
        </div>

        <div className="pricing-box">
          <span>Status</span>
          <strong>{vm.status}</strong>
        </div>
      </div>

      <PayoffChart data={vm.payoff} currentPrice={vm.currentPrice} />

      <div className="greeks-grid">
        <div>
          <span>Delta</span>
          <strong>{vm.greeks.delta.toFixed(2)}</strong>
        </div>

        <div>
          <span>Theta/dia</span>
          <strong>{vm.greeks.theta.toFixed(2)}</strong>
        </div>

        <div>
          <span>Gamma</span>
          <strong>{vm.greeks.gamma.toFixed(4)}</strong>
        </div>

        <div>
          <span>Vega</span>
          <strong>{vm.greeks.vega.toFixed(2)}</strong>
        </div>
      </div>
    </aside>
  );
}