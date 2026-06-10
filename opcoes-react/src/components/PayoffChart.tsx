import type { PayoffPoint } from "../services/payoff";

interface Props {
  data: PayoffPoint[];
  currentPrice: number;
}

export default function PayoffChart({ data, currentPrice }: Props) {
  if (!data.length) {
    return <div className="chart-card">Sem dados para o gráfico</div>;
  }

  const width = 520;
const height = 180;
const padding = 28;

  const prices = data.map((point) => point.price);
  const pnls = data.map((point) => point.pnl);

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  const minPnl = Math.min(...pnls, 0);
  const maxPnl = Math.max(...pnls, 0);

  const xScale = (price: number) => {
    return (
      padding +
      ((price - minPrice) / (maxPrice - minPrice)) * (width - padding * 2)
    );
  };

  const yScale = (pnl: number) => {
    if (maxPnl === minPnl) return height / 2;

    return (
      height -
      padding -
      ((pnl - minPnl) / (maxPnl - minPnl)) * (height - padding * 2)
    );
  };

  const path = data
    .map((point, index) => {
      const x = xScale(point.price);
      const y = yScale(point.pnl);

      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  const zeroY = yScale(0);
  const currentX = xScale(currentPrice);

  return (
    <div className="chart-card">
      <h3>Gráfico da operação</h3>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="payoff-svg"
        role="img"
        aria-label="Gráfico de payoff da operação"
      >
        <line
          x1={padding}
          x2={width - padding}
          y1={zeroY}
          y2={zeroY}
          className="chart-zero-line"
        />

        <line
          x1={currentX}
          x2={currentX}
          y1={padding}
          y2={height - padding}
          className="chart-current-line"
        />

        <path d={path} className="chart-payoff-line" />

        <text x={padding} y={height - 8} className="chart-label">
          {minPrice.toFixed(2)}
        </text>

        <text x={width - padding - 40} y={height - 8} className="chart-label">
          {maxPrice.toFixed(2)}
        </text>

        <text x={currentX + 6} y={padding + 12} className="chart-current-text">
          Atual {currentPrice.toFixed(2)}
        </text>

        <text x={padding} y={padding - 10} className="chart-label">
          Lucro
        </text>
      </svg>
    </div>
  );
}