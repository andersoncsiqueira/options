import { useOperationDraftStore } from "../../store/useOperationDraftStore";

export default function LegTable() {
  const legs = useOperationDraftStore((state) => state.legs);
  const removeLeg = useOperationDraftStore((state) => state.removeLeg);

  if (legs.length === 0) {
    return (
      <div className="empty-box">
        Nenhuma perna adicionada ainda.
      </div>
    );
  }

  return (
    <div className="leg-table-wrapper">
      <table className="leg-table">
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
              <td className={leg.direction === "buy" ? "positive" : "negative"}>
                {leg.direction === "buy" ? "Compra" : "Venda"}
              </td>

              <td>{leg.optionType.toUpperCase()}</td>

              <td>{leg.strike.toFixed(2)}</td>

              <td>R$ {leg.premium.toFixed(2)}</td>

              <td>{leg.quantity}</td>

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