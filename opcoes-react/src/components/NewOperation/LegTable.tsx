import { useEffect, useMemo, useState } from "react";

import { useOperationDraftStore } from "../../store/useOperationDraftStore";
import type { LegDirection, OptionType } from "../../models/Leg";
import { getOptionBySymbol } from "../../services/optionsMarketApi";

type ApiRecord = Record<string, unknown>;

type LegWithOptionData = {
  optionCode?: string;
  optionSymbol?: string;
  lastPrice?: number;
};

const PRICE_KEYS = [
  "price",
  "lastPrice",
  "currentPrice",
  "premium",
  "regularMarketPrice",
  "close",
  "last",
  "bid",
  "ask",
  "markPrice",
  "marketPrice",
  "ultimoPreco",
  "preco",
];

function isRecord(value: unknown): value is ApiRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "string") {
    const cleanedValue = value
      .replace(/[^\d,.-]/g, "")
      .replace(/\.(?=\d{3})/g, "")
      .replace(",", ".");

    const numberValue = Number(cleanedValue);

    return Number.isFinite(numberValue) ? numberValue : undefined;
  }

  return undefined;
}

function findPriceInResponse(value: unknown, depth = 0): number | undefined {
  if (depth > 5) return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const price = findPriceInResponse(item, depth + 1);

      if (price !== undefined) {
        return price;
      }
    }

    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  for (const key of PRICE_KEYS) {
    const price = parseNumber(value[key]);

    if (price !== undefined) {
      return price;
    }
  }

  const priorityKeys = [
    "data",
    "option",
    "quote",
    "result",
    "results",
    "options",
    "payload",
  ];

  for (const key of priorityKeys) {
    const price = findPriceInResponse(value[key], depth + 1);

    if (price !== undefined) {
      return price;
    }
  }

  for (const nestedValue of Object.values(value)) {
    const price = findPriceInResponse(nestedValue, depth + 1);

    if (price !== undefined) {
      return price;
    }
  }

  return undefined;
}

function normalizeOptionCode(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().toUpperCase();
}

function getLegOptionCode(leg: LegWithOptionData) {
  return (
    normalizeOptionCode(leg.optionCode) ||
    normalizeOptionCode(leg.optionSymbol)
  );
}

function isValidOptionCode(optionCode: string) {
  // Ex: PETRG424, PETRG419, PETRG415, VALEG550
  return /^[A-Z]{5,6}[0-9]{3}$/.test(optionCode);
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function useDebouncedValue<T>(value: T, delay = 700) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default function LegTable() {
  const legs = useOperationDraftStore((state) => state.legs);
  const removeLeg = useOperationDraftStore((state) => state.removeLeg);
  const updateLeg = useOperationDraftStore((state) => state.updateLeg);

  const [currentPremiums, setCurrentPremiums] = useState<Record<string, number>>(
    {}
  );

  const [loadingCodes, setLoadingCodes] = useState<Record<string, boolean>>({});
  const [priceErrors, setPriceErrors] = useState<Record<string, string>>({});

  const validLegCodeSignature = useMemo(() => {
    return legs
      .map((leg) => {
        const legWithOptionData = leg as typeof leg & LegWithOptionData;
        const optionCode = getLegOptionCode(legWithOptionData);

        if (!isValidOptionCode(optionCode)) return "";

        return `${leg.id}:${optionCode}`;
      })
      .filter(Boolean)
      .join("|");
  }, [legs]);

  const debouncedLegCodeSignature = useDebouncedValue(
    validLegCodeSignature,
    700
  );

  useEffect(() => {
    if (!debouncedLegCodeSignature) {
      return;
    }

    const legCodePairs = debouncedLegCodeSignature
      .split("|")
      .map((item) => {
        const [id, optionCode] = item.split(":");

        return {
          id,
          optionCode,
        };
      })
      .filter((item) => item.id && item.optionCode);

    const uniqueOptionCodes = Array.from(
      new Set(legCodePairs.map((item) => item.optionCode))
    );

    if (uniqueOptionCodes.length === 0) {
      return;
    }

    let cancelled = false;

    async function loadCurrentPremiums() {
      await Promise.all(
        uniqueOptionCodes.map(async (optionCode) => {
          try {
            setLoadingCodes((current) => ({
              ...current,
              [optionCode]: true,
            }));

            setPriceErrors((current) => ({
              ...current,
              [optionCode]: "",
            }));

            const response = await getOptionBySymbol(optionCode);
            const currentPremium = findPriceInResponse(response);

            if (cancelled) return;

            if (currentPremium === undefined) {
              console.warn(
                `[LegTable] API respondeu, mas não encontrei preço para ${optionCode}:`,
                response
              );

              setPriceErrors((current) => ({
                ...current,
                [optionCode]: "Sem preço",
              }));

              return;
            }

            setCurrentPremiums((current) => ({
              ...current,
              [optionCode]: currentPremium,
            }));

            legCodePairs
              .filter((item) => item.optionCode === optionCode)
              .forEach((item) => {
                updateLeg(item.id, {
                  lastPrice: currentPremium,
                } as Partial<(typeof legs)[number]>);
              });
          } catch (error) {
            console.error(
              `Erro ao buscar prêmio atual de ${optionCode}:`,
              error
            );

            if (!cancelled) {
              setPriceErrors((current) => ({
                ...current,
                [optionCode]: "Erro",
              }));
            }
          } finally {
            if (!cancelled) {
              setLoadingCodes((current) => ({
                ...current,
                [optionCode]: false,
              }));
            }
          }
        })
      );
    }

    loadCurrentPremiums();

    return () => {
      cancelled = true;
    };
  }, [debouncedLegCodeSignature, updateLeg]);

  if (legs.length === 0) {
    return <div className="empty-box">Nenhuma perna adicionada ainda.</div>;
  }

  return (
    <div className="leg-table-wrapper">
      <table className="leg-table editable-leg-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Direção</th>
            <th>Tipo</th>
            <th>Strike</th>
            <th>Prêmio</th>
            <th>Prêmio atual</th>
            <th>Qtd</th>
            <th></th>
          </tr>
        </thead>

        <tbody>
          {legs.map((leg) => {
            const legWithOptionData = leg as typeof leg & LegWithOptionData;
            const optionCode = getLegOptionCode(legWithOptionData);

            const hasCode = optionCode.length > 0;
            const isValidCode = isValidOptionCode(optionCode);

            const currentPremium =
              optionCode && currentPremiums[optionCode] !== undefined
                ? currentPremiums[optionCode]
                : legWithOptionData.lastPrice;

            const isLoadingPrice = optionCode
              ? Boolean(loadingCodes[optionCode])
              : false;

            const priceError = optionCode ? priceErrors[optionCode] : "";

            return (
              <tr key={leg.id}>
                <td>
                  <input
                    type="text"
                    value={optionCode}
                    placeholder="Ex: PETRG424"
                    onChange={(e) => {
                      const cleanOptionCode = e.target.value
                        .trim()
                        .toUpperCase();

                      updateLeg(leg.id, {
                        optionCode: cleanOptionCode,
                        optionSymbol: cleanOptionCode,
                        lastPrice: undefined,
                      } as Partial<typeof leg>);
                    }}
                  />
                </td>

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
                  <div className="readonly-price-cell">
                    {!hasCode
                      ? "—"
                      : !isValidCode
                        ? "Aguardando código"
                        : isLoadingPrice
                          ? "Buscando..."
                          : priceError
                            ? priceError
                            : currentPremium !== undefined
                              ? formatCurrency(currentPremium)
                              : "—"}
                  </div>
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
                    type="button"
                    className="btn-danger-small"
                    onClick={() => removeLeg(leg.id)}
                  >
                    Remover
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}