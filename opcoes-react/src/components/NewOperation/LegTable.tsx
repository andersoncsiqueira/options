import { useOperationDraftStore } from "../../store/useOperationDraftStore";
import type { LegDirection, OptionType } from "../../models/Leg";

export default function LegTable() {
  const legs = useOperationDraftStore((state) => state.legs);
  const removeLeg = useOperationDraftStore((state) => state.removeLeg);
  const updateLeg = useOperationDraftStore((state) => state.updateLeg);

  if (legs.length === 0) {
    return <div className="empty-box">Nenhuma perna adicionada ainda.</div>;
  }

  return (
    <div className="leg-table-wrapper">
      <table className="leg-table editable-leg-table">
        <thead>
          <tr>
            <th>Direção</th>
            <th>Tipo</th>
            <th>Strike</th>
            <th>Prêmio</th>
            <th>Qtd</th>
            <th></th>
          </tr>
        </thead>

        <tbody>
          {legs.map((leg) => (
            <tr key={leg.id}>
              <td>
                <select
                  value={leg.direction}
                  className={leg.direction === "buy" ? "positive" : "negative"}
                  onChange={(e) =>
                    updateLeg(leg.id, {
                      direction: e.target.value as LegDirection,
                    })
                  }
                >
                  <option value="buy">Compra</option>
                  <option value="sell">Venda</option>
                </select>
              </td>

              <td>
                <select
                  value={leg.optionType}
                  onChange={(e) =>
                    updateLeg(leg.id, {
                      optionType: e.target.value as OptionType,
                    })
                  }
                >
                  <option value="call">CALL</option>
                  <option value="put">PUT</option>
                </select>
              </td>

              <td>
                <input
                  type="number"
                  step="0.01"
                  value={leg.strike}
                  onChange={(e) =>
                    updateLeg(leg.id, {
                      strike: Number(e.target.value),
                    })
                  }
                />
              </td>

              <td>
                <input
                  type="number"
                  step="0.01"
                  value={leg.premium}
                  onChange={(e) =>
                    updateLeg(leg.id, {
                      premium: Number(e.target.value),
                    })
                  }
                />
              </td>

              <td>
                <input
                  type="number"
                  step="1"
                  value={leg.quantity}
                  onChange={(e) =>
                    updateLeg(leg.id, {
                      quantity: Number(e.target.value),
                    })
                  }
                />
              </td>

              <td>
                <button
                  className="btn-danger-small"
                  onClick={() => removeLeg(leg.id)}
                >
                  Remover
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}