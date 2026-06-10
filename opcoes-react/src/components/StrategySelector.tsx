import { useEffect, useMemo, useState } from "react";
import { useOperationDraftStore } from "../store/useOperationDraftStore";
import { useMarketDataStore } from "../store/useMarketDataStore";
import type { Leg } from "../models/Leg";

type StrategyPreset =
  | "long-call"
  | "bull-call-spread"
  | "call-butterfly"
  | "long-put"
  | "bear-put-spread";

function createId() {
  return crypto.randomUUID();
}

function makeLeg(
  direction: Leg["direction"],
  optionType: Leg["optionType"],
  strike: number,
  premium: number,
  quantity: number
): Leg {
  return {
    id: createId(),
    direction,
    optionType,
    strike,
    premium,
    quantity,
  };
}

function roundPremium(value: number) {
  return Number(value.toFixed(2));
}

function roundStrike(value: number) {
  return Number(value.toFixed(2));
}

function normalizeSymbol(value: string) {
  return value.trim().toUpperCase();
}

export function StrategySelector() {
  const { clear, setName, setSymbol, setCurrentPrice, addLeg } =
    useOperationDraftStore();

  const { prices } = useMarketDataStore();

  const [strategy, setStrategy] = useState<StrategyPreset>("call-butterfly");
  const [symbolInput, setSymbolInput] = useState("PETR4");
  const [centerStrike, setCenterStrike] = useState(30);
  const [strikeDistance, setStrikeDistance] = useState(2);
  const [quantity, setQuantity] = useState(100);
  const [basePremium, setBasePremium] = useState(1);

  const normalizedSymbol = useMemo(
    () => normalizeSymbol(symbolInput),
    [symbolInput]
  );

  const marketPrice = prices[normalizedSymbol];

  useEffect(() => {
    if (!marketPrice || marketPrice <= 0) return;

    setCenterStrike(roundStrike(marketPrice));
  }, [marketPrice]);

  function applyStrategy() {
    const symbol = normalizedSymbol || "PETR4";

    const center = Number(centerStrike);
    const distance = Number(strikeDistance);
    const qty = Number(quantity);
    const premium = Number(basePremium);

    if (!center || center <= 0) return;
    if (!distance || distance <= 0) return;
    if (!qty || qty <= 0) return;
    if (premium < 0) return;

    clear();

    setSymbol(symbol);

    if (marketPrice && marketPrice > 0) {
      setCurrentPrice(marketPrice);
    } else {
      setCurrentPrice(center);
    }

    if (strategy === "long-call") {
      setName("Long Call");

      addLeg(makeLeg("buy", "call", center, roundPremium(premium), qty));

      return;
    }

    if (strategy === "bull-call-spread") {
      setName("Trava de Alta com Call");

      addLeg(makeLeg("buy", "call", center, roundPremium(premium), qty));

      addLeg(
        makeLeg(
          "sell",
          "call",
          center + distance,
          roundPremium(premium * 0.5),
          qty
        )
      );

      return;
    }

    if (strategy === "call-butterfly") {
      setName("Borboleta com Call");

      addLeg(
        makeLeg(
          "buy",
          "call",
          center - distance,
          roundPremium(premium * 1.8),
          qty
        )
      );

      addLeg(makeLeg("sell", "call", center, roundPremium(premium), qty * 2));

      addLeg(
        makeLeg(
          "buy",
          "call",
          center + distance,
          roundPremium(premium * 0.45),
          qty
        )
      );

      return;
    }

    if (strategy === "long-put") {
      setName("Long Put");

      addLeg(makeLeg("buy", "put", center, roundPremium(premium), qty));

      return;
    }

    if (strategy === "bear-put-spread") {
      setName("Trava de Baixa com Put");

      addLeg(
        makeLeg(
          "buy",
          "put",
          center + distance,
          roundPremium(premium),
          qty
        )
      );

      addLeg(
        makeLeg(
          "sell",
          "put",
          center,
          roundPremium(premium * 0.5),
          qty
        )
      );

      return;
    }
  }

  return (
    <div className="strategy-selector">
      <div>
        <h3>Estratégia guiada</h3>
        <p>
          Escolha uma estrutura inicial. Se o ativo tiver preço monitorado, o
          strike central será ajustado automaticamente.
        </p>
      </div>

      <div className="strategy-form">
        <label>
          Estratégia
          <select
            value={strategy}
            onChange={(event) =>
              setStrategy(event.target.value as StrategyPreset)
            }
          >
            <option value="long-call">Long Call</option>
            <option value="bull-call-spread">Trava de Alta com Call</option>
            <option value="call-butterfly">Borboleta com Call</option>
            <option value="long-put">Long Put</option>
            <option value="bear-put-spread">Trava de Baixa com Put</option>
          </select>
        </label>

        <label>
          Ativo
          <input
            value={symbolInput}
            onChange={(event) => setSymbolInput(event.target.value)}
            placeholder="PETR4"
          />
        </label>

        <label>
          Preço monitorado
          <input
            value={marketPrice ? marketPrice.toFixed(2) : "Não encontrado"}
            disabled
          />
        </label>

        <label>
          Strike central
          <input
            type="number"
            step="0.01"
            value={centerStrike}
            onChange={(event) => setCenterStrike(Number(event.target.value))}
          />
        </label>

        <label>
          Distância entre strikes
          <input
            type="number"
            step="0.01"
            value={strikeDistance}
            onChange={(event) => setStrikeDistance(Number(event.target.value))}
          />
        </label>

        <label>
          Quantidade base
          <input
            type="number"
            step="1"
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value))}
          />
        </label>

        <label>
          Prêmio base
          <input
            type="number"
            step="0.01"
            value={basePremium}
            onChange={(event) => setBasePremium(Number(event.target.value))}
          />
        </label>
      </div>

      <div className="strategy-actions">
        <button type="button" onClick={applyStrategy}>
          Gerar estratégia
        </button>
      </div>
    </div>
  );
}