import { useState } from "react";
import type { Operation } from "../models/Operation";
import PayoffChart from "./PayoffChart";
import { buildOperationViewModel } from "../viewModels/OperationFactory";
import { useNavigate } from "react-router-dom";

interface Props {
  operation: Operation;
  currentPrice: number;
  onDelete?: (id: string) => void;
}

function formatCurrency(value: number) {
  return `R$ ${value.toFixed(2)}`;
}

export default function OperationCard({
  operation,
  currentPrice,
  onDelete,
}: Props) {
  const [expanded, setExpanded] = useState(false);
const navigate = useNavigate();
  const daysToExpiration = 30;

  const vm = buildOperationViewModel(
    operation,
    currentPrice,
    daysToExpiration
  );

  const pnlClass = vm.pnl >= 0 ? "positive" : "negative";

  return (
    <div className={`operation-card ${expanded ? "operation-card-expanded" : ""}`}>
      <div className="operation-card-header">
        <div>
          <h3>{operation.name}</h3>
          <p>
            {operation.symbol} · Vencimento: {operation.expirationDate}
          </p>
        </div>

        <div className="operation-card-pnl">
          <span className={pnlClass}>
            {vm.pnl >= 0 ? "+" : ""}
            {formatCurrency(vm.pnl)}
          </span>
        </div>
      </div>

      <div className="pricing-grid">
        <div className="pricing-box">
          <span>Fluxo negociado</span>
          <strong>{formatCurrency(vm.negotiatedValue)}</strong>
        </div>

        <div className="pricing-box">
          <span>Valor teórico BS</span>
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
          <strong
            className={
              vm.status === "barata"
                ? "positive"
                : vm.status === "cara"
                ? "negative"
                : "neutral"
            }
          >
            {vm.status.toUpperCase()}
          </strong>
        </div>
      </div>

      <PayoffChart data={vm.payoff} currentPrice={vm.currentPrice} />

      {expanded && (
        <div className="operation-details">
          <div className="details-grid">
            <div className="pricing-box">
              <span>Preço atual</span>
              <strong>{formatCurrency(vm.currentPrice)}</strong>
            </div>

            <div className="pricing-box">
              <span>Delta</span>
              <strong>{vm.greeks.delta.toFixed(2)}</strong>
            </div>

            <div className="pricing-box">
              <span>Theta/dia</span>
              <strong>{vm.greeks.theta.toFixed(2)}</strong>
            </div>

            <div className="pricing-box">
              <span>Gamma</span>
              <strong>{vm.greeks.gamma.toFixed(4)}</strong>
            </div>

            <div className="pricing-box">
              <span>Vega</span>
              <strong>{vm.greeks.vega.toFixed(2)}</strong>
            </div>

            <div className="pricing-box">
              <span>Rho</span>
              <strong>{vm.greeks.rho.toFixed(2)}</strong>
            </div>
          <div className="pricing-box">
  <span>Lucro máximo</span>
  <strong>
    {vm.maxProfit === "ilimitado"
      ? "Ilimitado"
      : formatCurrency(vm.maxProfit)}
  </strong>
</div>

<div className="pricing-box">
  <span>Prejuízo máximo</span>
  <strong className="negative">
    {vm.maxLoss === "ilimitado"
      ? "Ilimitado"
      : formatCurrency(vm.maxLoss)}
  </strong>
</div>

<div className="pricing-box">
  <span>Break-even</span>
  <strong>
    {vm.breakEvens.length > 0
      ? vm.breakEvens.map((value) => value.toFixed(2)).join(" / ")
      : "--"}
  </strong>
</div>

          </div>

          <div className="details-section">
            <h4>Pernas da operação</h4>

            <div className="leg-table-wrapper">
              <table className="leg-table">
                <thead>
                  <tr>
                    <th>Direção</th>
                    <th>Tipo</th>
                    <th>Strike</th>
                    <th>Prêmio</th>
                    <th>Qtd</th>
                  </tr>
                </thead>

                <tbody>
                  {operation.legs.map((leg) => (
                    <tr key={leg.id}>
                      <td
                        className={
                          leg.direction === "buy" ? "positive" : "negative"
                        }
                      >
                        {leg.direction === "buy" ? "Compra" : "Venda"}
                      </td>

                      <td>{leg.optionType.toUpperCase()}</td>

                      <td>{leg.strike.toFixed(2)}</td>

                      <td>{formatCurrency(leg.premium)}</td>

                      <td>{leg.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="operation-actions">
        <button
          className="btn-secondary"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Recolher" : "Expandir"}
        </button>

       <button
  className="btn-secondary"
  onClick={() => navigate(`/edit-operation/${operation.id}`)}
>
  Editar
</button>

        {onDelete && (
          <button
            className="btn-danger"
            onClick={() => {
              const confirmed = confirm(
                `Deseja excluir a operação "${operation.name}"?`
              );

              if (confirmed) {
                onDelete(operation.id);
              }
            }}
          >
            Excluir
          </button>
        )}
      </div>
    </div>
  );
}