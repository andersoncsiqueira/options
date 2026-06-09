import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

import type { PayoffPoint } from "../services/payoff";

interface Props {
  data: PayoffPoint[];
  currentPrice: number;
}

export default function PayoffChart({ data, currentPrice }: Props) {
  return (
    <div className="chart-card">
      <h3>Gráfico da operação</h3>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />

          <XAxis
            dataKey="price"
            label={{
              value: "Preço do ativo",
              position: "insideBottom",
              offset: -5,
            }}
          />

          <YAxis
            label={{
              value: "Lucro / Prejuízo",
              angle: -90,
              position: "insideLeft",
            }}
          />

          <Tooltip />

          <ReferenceLine y={0} stroke="#ffffff" />

          <ReferenceLine
            x={currentPrice}
            stroke="#facc15"
            label="Preço atual"
          />

          <Line
            type="monotone"
            dataKey="pnl"
            stroke="#22c55e"
            strokeWidth={3}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}