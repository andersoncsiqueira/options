import { useState } from "react";
import { useMarketDataStore } from "../store/useMarketDataStore";

export default function MarketPricesPanel() {
  const prices = useMarketDataStore((state) => state.prices);
  const setPrice = useMarketDataStore((state) => state.setPrice);

  const [symbol, setSymbol] = useState("PETR4");
  const [price, setPriceInput] = useState(100);

  function handleAddOrUpdate() {
    if (!symbol.trim()) {
      alert("Informe o ativo.");
      return;
    }

    if (price <= 0) {
      alert("Informe um preço válido.");
      return;
    }

    setPrice(symbol, price);
    setSymbol("");
    setPriceInput(0);
  }

  return (
    <section className="market-panel">
      <div className="section-title-row">
        <h3>Ativos monitorados</h3>
        <span>{Object.keys(prices).length} ativo(s)</span>
      </div>

      <div className="market-form">
        <input
          value={symbol}
          placeholder="PETR4"
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
        />

        <input
          type="number"
          step="0.01"
          value={price}
          placeholder="Preço"
          onChange={(e) => setPriceInput(Number(e.target.value))}
        />

        <button className="btn-primary" onClick={handleAddOrUpdate}>
          Atualizar preço
        </button>
      </div>

      <div className="market-list">
        {Object.entries(prices).map(([asset, assetPrice]) => (
          <div className="market-row" key={asset}>
            <div>
              <strong>{asset}</strong>
              <span>Manual</span>
            </div>

            <input
              type="number"
              step="0.01"
              value={assetPrice}
              onChange={(e) => setPrice(asset, Number(e.target.value))}
            />
          </div>
        ))}
      </div>
    </section>
  );
}