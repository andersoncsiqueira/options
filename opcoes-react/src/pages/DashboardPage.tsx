import { useEffect, useState } from "react";
import Layout from "../components/Layout/Layout";
import { getQuote } from "../services/marketData/marketDataService";
import type { Quote } from "../services/marketData/marketData.types";

export default function DashboardPage() {
  const [quote, setQuote] = useState<Quote | null>(null);

  useEffect(() => {
    async function loadQuote() {
      const data = await getQuote("PETR4");
      setQuote(data);
    }

    loadQuote();
  }, []);

  return (
    <Layout>
      <h2>Dashboard</h2>

      <div className="card">
        <h3>PETR4</h3>

        {quote ? (
          <>
            <p>Último preço: R$ {quote.last.toFixed(2)}</p>
            <p>Bid: R$ {quote.bid?.toFixed(2)}</p>
            <p>Ask: R$ {quote.ask?.toFixed(2)}</p>
            <p>Fonte: {quote.source}</p>
          </>
        ) : (
          <p>Sem cotação</p>
        )}
      </div>
    </Layout>
  );
}