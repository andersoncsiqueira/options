import { useState } from "react";
import { useOperationDraftStore } from "../../store/useOperationDraftStore";
import type { LegDirection, OptionType } from "../../models/Leg";

export default function LegEditor() {
  const addLeg = useOperationDraftStore((state) => state.addLeg);

  const [direction, setDirection] = useState<LegDirection>("buy");
  const [optionType, setOptionType] = useState<OptionType>("call");
  const [strike, setStrike] = useState(100);
  const [premium, setPremium] = useState(1);
  const [quantity, setQuantity] = useState(100);

  function handleAddLeg() {
    addLeg({
      id: crypto.randomUUID(),
      direction,
      optionType,
      strike,
      premium,
      quantity,
    });
  }

  return (
    <div className="leg-editor">
      <h3>Pernas</h3>

      <div className="leg-editor-grid">
        <label>
          Direção
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as LegDirection)}
          >
            <option value="buy">Comprar</option>
            <option value="sell">Vender</option>
          </select>
        </label>

        <label>
          Tipo
          <select
            value={optionType}
            onChange={(e) => setOptionType(e.target.value as OptionType)}
          >
            <option value="call">CALL</option>
            <option value="put">PUT</option>
          </select>
        </label>

        <label>
          Strike
          <input
            type="number"
            value={strike}
            onChange={(e) => setStrike(Number(e.target.value))}
          />
        </label>

        <label>
          Prêmio
          <input
            type="number"
            step="0.01"
            value={premium}
            onChange={(e) => setPremium(Number(e.target.value))}
          />
        </label>

        <label>
          Quantidade
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </label>

        <button className="btn-primary add-leg-btn" onClick={handleAddLeg}>
          + Adicionar
        </button>
      </div>
    </div>
  );
}