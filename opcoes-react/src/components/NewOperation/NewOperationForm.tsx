import { useNavigate } from "react-router-dom";

import { useOperationDraftStore } from "../../store/useOperationDraftStore";
import { useOperationsStore } from "../../store/useOperationsStore";
import { useMarketDataStore } from "../../store/useMarketDataStore";
import { StrategySelector } from "../StrategySelector";

import type { Operation } from "../../models/Operation";

import LegEditor from "./LegEditor";
import LegTable from "./LegTable";

interface Props {
  editingId?: string;
}

type LegWithOptionCode = {
  optionCode?: string;
  optionSymbol?: string;
};

export default function NewOperationForm({ editingId }: Props) {
  const navigate = useNavigate();

  const {
    name,
    symbol,
    expirationDate,
    volatility,
    riskFreeRate,
    currentPrice,
    setName,
    setSymbol,
    setExpirationDate,
    setVolatility,
    setRiskFreeRate,
    setCurrentPrice,
    clear,
  } = useOperationDraftStore();

  const legs = useOperationDraftStore((state) => state.legs);

  const addOperation = useOperationsStore((state) => state.addOperation);
  const updateOperation = useOperationsStore((state) => state.updateOperation);

  const setPrice = useMarketDataStore((state) => state.setPrice);

  function handleSaveOperation() {
    const cleanName = name.trim();
    const cleanSymbol = symbol.trim().toUpperCase();

    if (!cleanName) {
      alert("Informe o nome da operação.");
      return;
    }

    if (!cleanSymbol) {
      alert("Informe o ativo.");
      return;
    }

    if (!expirationDate) {
      alert("Informe o vencimento.");
      return;
    }

    if (legs.length === 0) {
      alert("Adicione pelo menos uma perna.");
      return;
    }

    const normalizedLegs = legs.map((leg) => {
      const legWithCode = leg as typeof leg & LegWithOptionCode;

      const cleanOptionCode = (
        legWithCode.optionCode ??
        legWithCode.optionSymbol ??
        ""
      )
        .trim()
        .toUpperCase();

      return {
        ...leg,

        // mantém compatibilidade com os dois nomes usados no projeto
        optionCode: cleanOptionCode,
        optionSymbol: cleanOptionCode,

        strike: Number(leg.strike) || 0,
        premium: Number(leg.premium) || 0,
        quantity: Number(leg.quantity) || 0,
      };
    });

    const operation: Operation = {
      id: editingId ?? crypto.randomUUID(),
      name: cleanName,
      symbol: cleanSymbol,
      createdAt: new Date().toISOString(),
      expirationDate,
      volatility: Number(volatility) || 0,
      riskFreeRate: Number(riskFreeRate) || 0,
      legs: normalizedLegs,
    };

    setPrice(cleanSymbol, Number(currentPrice) || 0);

    if (editingId) {
      updateOperation(editingId, operation);
    } else {
      addOperation(operation);
    }

    clear();

    navigate("/portfolio");
  }

  return (
    <section className="builder-panel">
      <h3>Dados da operação</h3>

      <div className="form-grid">
        <label>
          Nome
          <input
            value={name}
            placeholder="Ex: Trava de Alta PETR4"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label>
          Ativo
          <input
            value={symbol}
            placeholder="PETR4"
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          />
        </label>

        <label>
          Preço atual
          <input
            type="number"
            step="0.01"
            value={currentPrice}
            onChange={(e) => setCurrentPrice(Number(e.target.value))}
          />
        </label>

        <label>
          Vencimento
          <input
            type="date"
            value={expirationDate}
            onChange={(e) => setExpirationDate(e.target.value)}
          />
        </label>

        <label>
          Volatilidade
          <input
            type="number"
            step="0.01"
            value={volatility}
            onChange={(e) => setVolatility(Number(e.target.value))}
          />
        </label>

        <label>
          Taxa livre de risco
          <input
            type="number"
            step="0.01"
            value={riskFreeRate}
            onChange={(e) => setRiskFreeRate(Number(e.target.value))}
          />
        </label>
      </div>

      <StrategySelector />

      <LegEditor />

      <LegTable />

      <div className="actions-row">
        <button type="button" className="btn-secondary" onClick={clear}>
          Limpar
        </button>

        <button type="button" className="btn-primary" onClick={handleSaveOperation}>
          {editingId ? "Salvar alterações" : "Salvar operação"}
        </button>
      </div>
    </section>
  );
}