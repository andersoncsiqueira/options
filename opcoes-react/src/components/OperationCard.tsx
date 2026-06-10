import type { Operation } from "../models/Operation";
import PayoffChart from "./PayoffChart";
import {
  calculateOperationPayoffAtPrice,
  generatePayoffPoints,
} from "../services/payoff";
import { calculateOperationMispricing } from "../services/operationPricing";

interface Props {
  operation: Operation;
  currentPrice: number;
}

function formatCurrency(value: number) {
  return `R$ ${value.toFixed(2)}`;
}

export default function OperationCard({ operation, currentPrice }: Props) {
  const payoffData = generatePayoffPoints(operation.legs, currentPrice);

  const currentPnl = calculateOperationPayoffAtPrice(
    operation.legs,
    currentPrice
  );

  const daysToExpiration = 30;

  const pricing = calculateOperationMispricing(
    operation,
    currentPrice,
    daysToExpiration
  );

  const pnlClass = currentPnl >= 0 ? "positive" : "negative";

  return (
    <div className="operation-card">
      <div className="operation-card-header">
        <div>
          <h3>{operation.name}</h3>
          <p>
            {operation.symbol} · Vencimento: {operation.expirationDate}
          </p>
        </div>

        <div className={pnlClass}>
          {currentPnl >= 0 ? "+" : ""}
          {formatCurrency(currentPnl)}
        </div>
      </div>

      <div className="pricing-grid">
        <div className="pricing-box">
          <span>Fluxo negociado</span>
          <strong>{formatCurrency(pricing.negotiatedCashFlow)}</strong>
        </div>

        <div className="pricing-box">
          <span>Valor teórico BS</span>
          <strong>{formatCurrency(pricing.theoreticalValue)}</strong>
        </div>

        <div className="pricing-box">
          <span>Diferença</span>
          <strong className={pricing.difference >= 0 ? "positive" : "negative"}>
            {formatCurrency(pricing.difference)}
          </strong>
        </div>

        <div className="pricing-box">
          <span>Status</span>
          <strong>{pricing.status}</strong>
        </div>
      </div>

      <PayoffChart data={payoffData} currentPrice={currentPrice} />
    </div>
  );
}