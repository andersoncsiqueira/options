import Layout from "../components/Layout/Layout";
import PayoffChart from "../components/PayoffChart";
import { generatePayoffPoints } from "../services/payoff";
import type { Leg } from "../models/Leg";

export default function OperationsPage() {
  const currentPrice = 100;

  const legs: Leg[] = [
    {
      id: "1",
      direction: "buy",
      optionType: "call",
      underlyingPrice: 100,
      strike: 100,
      premium: 5,
      quantity: 100,
    },
    {
      id: "2",
      direction: "sell",
      optionType: "call",
      underlyingPrice: 100,
      strike: 110,
      premium: 2,
      quantity: 100,
    },
  ];

  const payoffData = generatePayoffPoints(legs, currentPrice);

  return (
    <Layout>
      <h2>Operações</h2>

      <p>Teste: Trava de alta com CALL</p>

      <PayoffChart data={payoffData} currentPrice={currentPrice} />
    </Layout>
  );
}