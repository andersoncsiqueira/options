import { useMemo, useState, type FormEvent } from "react";

import { getOptionsChain } from "../services/optionsMarketApi";

import "../styles/option-chain-by-asset.css";

export type OptionType = "call" | "put" | "unknown";

export type OptionChainItem = {
  symbol: string;
  type: OptionType;
  strike?: number;
  expirationDate?: string;
  lastPrice?: number;
  bid?: number;
  ask?: number;
  volume?: number;
  openInterest?: number;
  impliedVolatility?: number;
  raw: unknown;
};

type OptionChainByAssetProps = {
  defaultUnderlying?: string;
  onSelectOption?: (option: OptionChainItem) => void;
};

type ApiRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ApiRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  const normalized = String(value)
    .trim()
    .replace("R$", "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const numberValue = Number(normalized);

  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function toText(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const text = String(value).trim();

  return text || undefined;
}

function readFirst(record: ApiRecord, keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return undefined;
}

function formatCurrency(value?: number): string {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return "-";
  }

  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatNumber(value?: number): string {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return "-";
  }

  return value.toLocaleString("pt-BR");
}

function formatPercent(value?: number): string {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return "-";
  }

  const percent = value > 1 ? value : value * 100;

  return `${percent.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function formatDate(value?: string): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("pt-BR");
}

function inferOptionType(symbol: string, raw?: ApiRecord): OptionType {
  const explicitType = raw
    ? toText(
        readFirst(raw, [
          "type",
          "optionType",
          "option_type",
          "kind",
          "side",
          "callPut",
        ])
      )?.toLowerCase()
    : undefined;

  if (explicitType) {
    if (
      explicitType.includes("call") ||
      explicitType.includes("compra") ||
      explicitType === "c"
    ) {
      return "call";
    }

    if (
      explicitType.includes("put") ||
      explicitType.includes("venda") ||
      explicitType === "p"
    ) {
      return "put";
    }
  }

  const match = symbol.toUpperCase().match(/^[A-Z]{4}([A-X])/);

  if (!match?.[1]) {
    return "unknown";
  }

  const seriesLetter = match[1];

  if ("ABCDEFGHIJKL".includes(seriesLetter)) {
    return "call";
  }

  if ("MNOPQRSTUVWX".includes(seriesLetter)) {
    return "put";
  }

  return "unknown";
}

function normalizeOption(rawOption: unknown): OptionChainItem | null {
  if (!isRecord(rawOption)) {
    return null;
  }

  const symbol = toText(
    readFirst(rawOption, [
      "symbol",
      "code",
      "ticker",
      "optionSymbol",
      "option_symbol",
      "optionCode",
      "option_code",
      "contractSymbol",
      "contract_symbol",
      "asset",
      "ativo",
    ])
  )?.toUpperCase();

  if (!symbol) {
    return null;
  }

  return {
    symbol,
    type: inferOptionType(symbol, rawOption),
    strike: toNumber(
      readFirst(rawOption, [
        "strike",
        "strikePrice",
        "strike_price",
        "exercisePrice",
        "exercise_price",
        "precoExercicio",
        "preco_exercicio",
      ])
    ),
    expirationDate: toText(
      readFirst(rawOption, [
        "expirationDate",
        "expiration_date",
        "maturityDate",
        "maturity_date",
        "dueDate",
        "due_date",
        "vencimento",
      ])
    ),
    lastPrice: toNumber(
      readFirst(rawOption, [
        "lastPrice",
        "last_price",
        "price",
        "currentPrice",
        "current_price",
        "close",
        "regularMarketPrice",
        "premium",
        "premio",
        "ultimo",
        "último",
      ])
    ),
    bid: toNumber(
      readFirst(rawOption, ["bid", "bidPrice", "bid_price", "compra"])
    ),
    ask: toNumber(
      readFirst(rawOption, ["ask", "askPrice", "ask_price", "venda"])
    ),
    volume: toNumber(
      readFirst(rawOption, ["volume", "regularMarketVolume", "volumeNegociado"])
    ),
    openInterest: toNumber(
      readFirst(rawOption, [
        "openInterest",
        "open_interest",
        "oi",
        "contratosAbertos",
        "openContracts",
      ])
    ),
    impliedVolatility: toNumber(
      readFirst(rawOption, [
        "impliedVolatility",
        "implied_volatility",
        "iv",
        "volatilidadeImplicita",
        "vol_implicita",
      ])
    ),
    raw: rawOption,
  };
}

function extractCandidates(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload)) {
    return [];
  }

  const candidates: unknown[] = [];

  const arrayKeys = [
    "data",
    "options",
    "results",
    "items",
    "contracts",
    "chain",
    "optionChain",
  ];

  for (const key of arrayKeys) {
    const value = payload[key];

    if (Array.isArray(value)) {
      candidates.push(...value);
    }
  }

  if (Array.isArray(payload.calls)) {
    candidates.push(
      ...payload.calls.map((item) =>
        isRecord(item) ? { ...item, type: item.type ?? "call" } : item
      )
    );
  }

  if (Array.isArray(payload.puts)) {
    candidates.push(
      ...payload.puts.map((item) =>
        isRecord(item) ? { ...item, type: item.type ?? "put" } : item
      )
    );
  }

  if (isRecord(payload.data)) {
    candidates.push(...extractCandidates(payload.data));
  }

  if (isRecord(payload.optionChain)) {
    candidates.push(...extractCandidates(payload.optionChain));
  }

  return candidates;
}

function normalizeOptionsPayload(payload: unknown): OptionChainItem[] {
  const normalized = extractCandidates(payload)
    .map(normalizeOption)
    .filter((item): item is OptionChainItem => Boolean(item));

  const uniqueBySymbol = new Map<string, OptionChainItem>();

  for (const option of normalized) {
    uniqueBySymbol.set(option.symbol, option);
  }

  return Array.from(uniqueBySymbol.values()).sort((a, b) => {
    const dateCompare = String(a.expirationDate ?? "").localeCompare(
      String(b.expirationDate ?? "")
    );

    if (dateCompare !== 0) {
      return dateCompare;
    }

    return Number(a.strike ?? 0) - Number(b.strike ?? 0);
  });
}

export default function OptionChainByAsset({
  defaultUnderlying = "PETR4",
  onSelectOption,
}: OptionChainByAssetProps) {
  const [underlying, setUnderlying] = useState(defaultUnderlying);
  const [options, setOptions] = useState<OptionChainItem[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "call" | "put">("all");
  const [textFilter, setTextFilter] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const filteredOptions = useMemo(() => {
    const cleanText = textFilter.trim().toUpperCase();

    return options.filter((option) => {
      const matchesType =
        typeFilter === "all" ? true : option.type === typeFilter;

      const matchesText =
        !cleanText ||
        option.symbol.includes(cleanText) ||
        String(option.strike ?? "").includes(cleanText);

      return matchesType && matchesText;
    });
  }, [options, typeFilter, textFilter]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const cleanUnderlying = underlying.trim().toUpperCase();

    if (!cleanUnderlying) {
      setErrorMessage("Digite o código da ação. Exemplo: PETR4.");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    setOptions([]);
    setSelectedSymbol("");

    try {
      const response = await getOptionsChain(cleanUnderlying);
      const normalizedOptions = normalizeOptionsPayload(response);

      setOptions(normalizedOptions);

      if (normalizedOptions.length === 0) {
        setErrorMessage(`Nenhuma opção encontrada para ${cleanUnderlying}.`);
      }
    } catch (error) {
      console.error("Erro ao buscar opções por ativo:", error);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível buscar as opções desse ativo."
      );
    } finally {
      setIsLoading(false);
    }
  }

  function handleSelectOption(option: OptionChainItem) {
    setSelectedSymbol(option.symbol);
    onSelectOption?.(option);
  }

  return (
    <section className="option-chain-by-asset">
      <div className="option-chain-by-asset__header">
        <div>
          <h2>Opções disponíveis</h2>

          <p>
            Digite o código da ação para carregar a lista de calls e puts
            disponíveis.
          </p>
        </div>

        <form
          className="option-chain-by-asset__search"
          onSubmit={handleSubmit}
        >
          <input
            value={underlying}
            onChange={(event) => setUnderlying(event.target.value.toUpperCase())}
            placeholder="Ex: PETR4"
          />

          <button type="submit" disabled={isLoading}>
            {isLoading ? "Buscando..." : "Buscar"}
          </button>
        </form>
      </div>

      {errorMessage && (
        <div className="option-chain-by-asset__error">{errorMessage}</div>
      )}

      {options.length > 0 && (
        <>
          <div className="option-chain-by-asset__filters">
            <select
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value as "all" | "call" | "put")
              }
            >
              <option value="all">Calls e puts</option>
              <option value="call">Somente calls</option>
              <option value="put">Somente puts</option>
            </select>

            <input
              value={textFilter}
              onChange={(event) => setTextFilter(event.target.value)}
              placeholder="Filtrar por código ou strike"
            />
          </div>

          <div className="option-chain-by-asset__count">
            {filteredOptions.length} opção(ões) encontrada(s)
          </div>

          <div className="option-chain-by-asset__table-wrapper">
            <table className="option-chain-by-asset__table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Tipo</th>
                  <th>Strike</th>
                  <th>Vencimento</th>
                  <th>Último</th>
                  <th>Bid</th>
                  <th>Ask</th>
                  <th>Volume</th>
                  <th>OI</th>
                  <th>IV</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {filteredOptions.map((option) => {
                  const selected = selectedSymbol === option.symbol;

                  return (
                    <tr
                      key={option.symbol}
                      className={selected ? "selected" : undefined}
                    >
                      <td>
                        <strong>{option.symbol}</strong>
                      </td>

                      <td>
                        <span
                          className={`option-chain-by-asset__badge option-chain-by-asset__badge--${option.type}`}
                        >
                          {option.type === "call"
                            ? "CALL"
                            : option.type === "put"
                            ? "PUT"
                            : "-"}
                        </span>
                      </td>

                      <td>{formatCurrency(option.strike)}</td>
                      <td>{formatDate(option.expirationDate)}</td>
                      <td>{formatCurrency(option.lastPrice)}</td>
                      <td>{formatCurrency(option.bid)}</td>
                      <td>{formatCurrency(option.ask)}</td>
                      <td>{formatNumber(option.volume)}</td>
                      <td>{formatNumber(option.openInterest)}</td>
                      <td>{formatPercent(option.impliedVolatility)}</td>

                      <td>
                        <button
                          type="button"
                          className="option-chain-by-asset__use-button"
                          onClick={() => handleSelectOption(option)}
                        >
                          {selected ? "Selecionada" : "Usar"}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredOptions.length === 0 && (
                  <tr>
                    <td
                      className="option-chain-by-asset__empty"
                      colSpan={11}
                    >
                      Nenhuma opção bate com o filtro informado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
