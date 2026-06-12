import { useState } from "react";
import { useOperationDraftStore } from "../../store/useOperationDraftStore";
import type { LegDirection, OptionType } from "../../models/Leg";
import { getOptionBySymbol } from "../../services/optionsMarketApi";

type ApiRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ApiRecord {
  return typeof value === "object" && value !== null;
}

function toNumber(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function unwrapOption(raw: unknown): ApiRecord {
  if (!isRecord(raw)) return {};

  if (isRecord(raw.data)) return raw.data;
  if (isRecord(raw.option)) return raw.option;

  return raw;
}

function normalizeOptionType(value: unknown): OptionType | null {
  if (typeof value !== "string") return null;

  const upperValue = value.toUpperCase();

  if (upperValue === "CALL" || upperValue === "C") return "call";
  if (upperValue === "PUT" || upperValue === "P") return "put";

  return null;
}

function getOptionPrice(data: ApiRecord): number | undefined {
  return (
    toNumber(data.price) ??
    toNumber(data.lastPrice) ??
    toNumber(data.currentPrice) ??
    toNumber(data.close) ??
    toNumber(data.premium) ??
    toNumber(data.regularMarketPrice) ??
    toNumber(data.bid) ??
    toNumber(data.ask)
  );
}

function getOptionStrike(data: ApiRecord): number | undefined {
  return (
    toNumber(data.strike) ??
    toNumber(data.strikePrice) ??
    toNumber(data.exercisePrice)
  );
}

export default function LegEditor() {
  const addLeg = useOperationDraftStore((state) => state.addLeg);

  const [optionCode, setOptionCode] = useState("");
  const [direction, setDirection] = useState<LegDirection>("buy");
  const [optionType, setOptionType] = useState<OptionType>("call");
  const [strike, setStrike] = useState(100);
  const [premium, setPremium] = useState(1);
  const [quantity, setQuantity] = useState(100);

  const [isSearchingOption, setIsSearchingOption] = useState(false);
  const [optionSearchError, setOptionSearchError] = useState("");

  async function handleSearchOption() {
    const cleanOptionCode = optionCode.trim().toUpperCase();

    if (!cleanOptionCode) {
      setOptionSearchError("Digite o código da opção.");
      return;
    }

    try {
      setIsSearchingOption(true);
      setOptionSearchError("");

      const response = await getOptionBySymbol(cleanOptionCode);
      const optionData = unwrapOption(response);

      const apiStrike = getOptionStrike(optionData);
      const apiPremium = getOptionPrice(optionData);
      const apiType =
        normalizeOptionType(optionData.type) ??
        normalizeOptionType(optionData.optionType) ??
        normalizeOptionType(optionData.kind);

      if (apiStrike !== undefined) {
        setStrike(apiStrike);
      }

      if (apiPremium !== undefined) {
        setPremium(apiPremium);
      }

      if (apiType) {
        setOptionType(apiType);
      }

      setOptionCode(cleanOptionCode);

      if (apiStrike === undefined && apiPremium === undefined && !apiType) {
        setOptionSearchError(
          "A API respondeu, mas não encontrei strike, prêmio ou tipo nessa opção."
        );
      }
    } catch (error) {
      console.error("Erro ao buscar opção:", error);
      setOptionSearchError("Não foi possível buscar essa opção na API.");
    } finally {
      setIsSearchingOption(false);
    }
  }

  function handleAddLeg() {
  const cleanOptionCode = optionCode.trim().toUpperCase();

  addLeg({
    id: crypto.randomUUID(),
    optionCode: cleanOptionCode,
    optionSymbol: cleanOptionCode,
    direction,
    optionType,
    strike,
    premium,
    quantity,
  } as Parameters<typeof addLeg>[0]);
}

  return (
    <div className="leg-editor">
      <h3>Pernas</h3>

      <div className="leg-editor-grid">
        <label>
          Código da opção
          <input
            type="text"
            value={optionCode}
            placeholder="Ex: PETRF429"
            onChange={(e) => setOptionCode(e.target.value.toUpperCase())}
          />
        </label>

        <button
          className="btn-secondary"
          type="button"
          onClick={handleSearchOption}
          disabled={isSearchingOption}
        >
          {isSearchingOption ? "Buscando..." : "Buscar opção"}
        </button>

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
            step="0.01"
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
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </label>

        <button
          className="btn-primary add-leg-btn"
          type="button"
          onClick={handleAddLeg}
        >
          + Adicionar
        </button>
      </div>

      {optionSearchError && (
        <div className="empty-box" style={{ marginTop: 12 }}>
          {optionSearchError}
        </div>
      )}
    </div>
  );
}