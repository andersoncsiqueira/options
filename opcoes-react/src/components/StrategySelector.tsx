interface Props {
  onSelect: (strategy: string) => void;
}

const strategies = [
  {
    id: "manual",
    title: "🔧 Montagem Manual",
    description: "Adicione as pernas livremente",
  },
  {
    id: "long-call",
    title: "📈 Long Call",
    description: "Estratégia direcional de alta",
  },
  {
    id: "long-put",
    title: "📉 Long Put",
    description: "Estratégia direcional de baixa",
  },
  {
    id: "bull-call-spread",
    title: "🐂 Trava de Alta",
    description: "Compra + venda de CALL",
  },
  {
    id: "bear-put-spread",
    title: "🐻 Trava de Baixa",
    description: "Compra + venda de PUT",
  },
  {
    id: "butterfly",
    title: "🦋 Borboleta",
    description: "Baixa volatilidade",
  },
  {
    id: "iron-condor",
    title: "🦅 Iron Condor",
    description: "Estratégia neutra",
  },
];

export default function StrategySelector({ onSelect }: Props) {
  return (
    <div className="strategy-grid">
      {strategies.map((strategy) => (
        <button
          key={strategy.id}
          className="strategy-card"
          onClick={() => onSelect(strategy.id)}
        >
          <h3>{strategy.title}</h3>
          <p>{strategy.description}</p>
        </button>
      ))}
    </div>
  );
}