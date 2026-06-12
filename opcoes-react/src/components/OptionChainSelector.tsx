import { useMemo, useState } from "react";

export type OptionType = "call" | "put" | "unknown";

export interface OptionContract {
  symbol: string;
  underlying?: string;
  type: OptionType;
  strike: number | null;
  expirationDate?: string;
  lastPrice: number | null;
  bid: number | null;
  ask: number | null;
  volume: number | null;
  openInterest: number | null;
  impliedVolatility: number | null;
  raw: unknown;
}

interface OptionChainSelectorProps {
  defaultUnderlying?: string;
  title?: string;
  className?: string;
  onSelectOption?: (option: OptionContract) => void;
}

const API_BASE_URL = String(
  import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    ""
).replace(/\/$/, "");

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function read(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = obj[key];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return undefined;
}

function toNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const text = String(value)
    .trim()
    .replace("R$", "")
    .replace(/\s/g, "");

  if (!text) return null;

  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;

  const number = Number(normalized);

  return Number.isFinite(number) ? number : null;
}

function toText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;

  const text = String(value).trim();

  return text ? text : undefined;
}

function formatMoney(value: number | null): string {
  if (value === null) return "-";

  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatNumber(value: number | null): string {
  if (value === null) return "-";

  return value.toLocaleString("pt-BR");
}

function formatPercent(value: number | null): string {
  if (value === null) return "-";

  const finalValue = value > 1 ? value : value * 100;

  return `${finalValue.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function formatDate(value?: string): string {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("pt-BR");
}

function inferOptionType(
  raw: Record<string, unknown>,
  symbol: string
): OptionType {
  const explicitType = toText(
    read(raw, [
      "type",
      "optionType",
      "option_type",
      "kind",
      "side",
      "category",
      "callPut",
    ])
  )?.toLowerCase();

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

  const upperSymbol = symbol.toUpperCase();
  const match = upperSymbol.match(/^[A-Z]{4}([A-X])/);

  if (match?.[1]) {
    const seriesLetter = match[1];

    if ("ABCDEFGHIJKL".includes(seriesLetter)) {
      return "call";
    }

    if ("MNOPQRSTUVWX".includes(seriesLetter)) {
      return "put";
    }
  }

  return "unknown";
}

function normalizeOption(item: unknown): OptionContract | null {
  if (!isObject(item)) return null;

  const symbol = toText(
    read(item, [
      "symbol",
      "code",
      "ticker",
      "optionCode",
      "option_code",
      "contractSymbol",
      "contract_symbol",
      "asset",
      "ativo",
    ])
  );

  if (!symbol) return null;

  const underlying = toText(
    read(item, [
      "underlying",
      "underlyingSymbol",
      "underlying_symbol",
      "underlyingAsset",
      "ativoObjeto",
      "assetUnderlying",
    ])
  );

  const strike = toNumber(
    read(item, [
      "strike",
      "strikePrice",
      "strike_price",
      "exercisePrice",
      "exercise_price",
      "precoExercicio",
      "preco_exercicio",
    ])
  );

  const expirationDate = toText(
    read(item, [
      "expirationDate",
      "expiration_date",
      "maturityDate",
      "maturity_date",
      "dueDate",
      "due_date",
      "vencimento",
    ])
  );

  const lastPrice = toNumber(
    read(item, [
      "lastPrice",
      "last_price",
      "price",
      "close",
      "regularMarketPrice",
      "premium",
      "premio",
      "último",
      "ultimo",
    ])
  );

  const bid = toNumber(
    read(item, ["bid", "bidPrice", "bid_price", "compra"])
  );

  const ask = toNumber(
    read(item, ["ask", "askPrice", "ask_price", "venda"])
  );

  const volume = toNumber(
    read(item, ["volume", "regularMarketVolume", "volumeNegociado"])
  );

  const openInterest = toNumber(
    read(item, [
      "openInterest",
      "open_interest",
      "oi",
      "contratosAbertos",
      "openContracts",
    ])
  );

  const impliedVolatility = toNumber(
    read(item, [
      "impliedVolatility",
      "implied_volatility",
      "iv",
      "volatilidadeImplicita",
      "vol_implicita",
    ])
  );

  return {
    symbol: symbol.toUpperCase(),
    underlying,
    type: inferOptionType(item, symbol),
    strike,
    expirationDate,
    lastPrice,
    bid,
    ask,
    volume,
    openInterest,
    impliedVolatility,
    raw: item,
  };
}

function extractOptionsFromPayload(payload: unknown): OptionContract[] {
  const candidates: unknown[] = [];

  function collect(value: unknown) {
    if (Array.isArray(value)) {
      candidates.push(...value);
      return;
    }

    if (!isObject(value)) return;

    const directKeys = [
      "options",
      "data",
      "results",
      "items",
      "contracts",
      "optionChain",
      "chain",
    ];

    for (const key of directKeys) {
      const child = value[key];

      if (Array.isArray(child)) {
        candidates.push(...child);
      }
    }

    const calls = value.calls;
    const puts = value.puts;

    if (Array.isArray(calls)) {
      candidates.push(
        ...calls.map((item) =>
          isObject(item) ? { ...item, type: item.type ?? "call" } : item
        )
      );
    }

    if (Array.isArray(puts)) {
      candidates.push(
        ...puts.map((item) =>
          isObject(item) ? { ...item, type: item.type ?? "put" } : item
        )
      );
    }

    if (isObject(value.data)) {
      collect(value.data);
    }

    if (isObject(value.optionChain)) {
      collect(value.optionChain);
    }
  }

  collect(payload);

  const normalized = candidates
    .map(normalizeOption)
    .filter((item): item is OptionContract => Boolean(item));

  const uniqueBySymbol = new Map<string, OptionContract>();

  for (const option of normalized) {
    uniqueBySymbol.set(option.symbol, option);
  }

  return Array.from(uniqueBySymbol.values()).sort((a, b) => {
    const dateA = a.expirationDate || "";
    const dateB = b.expirationDate || "";

    if (dateA !== dateB) {
      return dateA.localeCompare(dateB);
    }

    const strikeA = a.strike ?? 0;
    const strikeB = b.strike ?? 0;

    return strikeA - strikeB;
  });
}

async function fetchOptionChain(underlying: string): Promise<OptionContract[]> {
  const cleanUnderlying = underlying.trim().toUpperCase();

  if (!cleanUnderlying) {
    throw new Error("Informe o código do ativo.");
  }

  const endpoints = [
    `${API_BASE_URL}/api/options/underlying/${encodeURIComponent(cleanUnderlying)}`,
    `${API_BASE_URL}/api/options?underlying=${encodeURIComponent(cleanUnderlying)}`,
    `${API_BASE_URL}/api/options?symbol=${encodeURIComponent(cleanUnderlying)}`,
    `${API_BASE_URL}/api/options-chain?underlying=${encodeURIComponent(cleanUnderlying)}`,
    `${API_BASE_URL}/api/options-chain?symbol=${encodeURIComponent(cleanUnderlying)}`,
  ];

  let lastError = "";

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint);

      if (!response.ok) {
        lastError = `Erro ${response.status} em ${endpoint}`;
        continue;
      }

      const payload = await response.json();
      const options = extractOptionsFromPayload(payload);

      if (options.length > 0) {
        return options;
      }

      lastError = "A API respondeu, mas não retornou opções.";
    } catch (error) {
      lastError =
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao buscar opções.";
    }
  }

  throw new Error(
    lastError || `Nenhuma opção encontrada para ${cleanUnderlying}.`
  );
}

export default function OptionChainSelector({
  defaultUnderlying = "",
  title = "Buscar opções por ativo",
  className = "",
  onSelectOption,
}: OptionChainSelectorProps) {
  const [underlying, setUnderlying] = useState(defaultUnderlying);
  const [options, setOptions] = useState<OptionContract[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<"all" | "call" | "put">("all");
  const [textFilter, setTextFilter] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const filteredOptions = useMemo(() => {
    const cleanText = textFilter.trim().toUpperCase();

    return options.filter((option) => {
      const matchesType =
        typeFilter === "all" ? true : option.type === typeFilter;

      const matchesText = cleanText
        ? option.symbol.includes(cleanText) ||
          String(option.strike ?? "").includes(cleanText)
        : true;

      return matchesType && matchesText;
    });
  }, [options, typeFilter, textFilter]);

  async function handleSearch(event?: React.FormEvent) {
    event?.preventDefault();

    const cleanUnderlying = underlying.trim().toUpperCase();

    if (!cleanUnderlying) {
      setError("Informe o ativo. Exemplo: PETR4, VALE3, BBAS3.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSelectedSymbol(null);

      const result = await fetchOptionChain(cleanUnderlying);

      setOptions(result);

      if (result.length === 0) {
        setError(`Nenhuma opção encontrada para ${cleanUnderlying}.`);
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Erro ao buscar lista de opções.";

      setOptions([]);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(option: OptionContract) {
    setSelectedSymbol(option.symbol);
    onSelectOption?.(option);
  }

  return (
    <div
      className={`w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}
    >
      <div className="mb-4 flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">
          Digite o ativo base para buscar as opções disponíveis. Exemplo: PETR4.
        </p>
      </div>

      <form
        onSubmit={handleSearch}
        className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]"
      >
        <input
          value={underlying}
          onChange={(event) => setUnderlying(event.target.value.toUpperCase())}
          placeholder="Digite o ativo. Ex: PETR4"
          className="h-11 rounded-xl border border-slate-300 px-3 text-sm font-medium uppercase outline-none transition focus:border-slate-900"
        />

        <button
          type="submit"
          disabled={loading}
          className="h-11 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Buscando..." : "Buscar opções"}
        </button>
      </form>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {options.length > 0 && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[180px_1fr]">
            <select
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value as "all" | "call" | "put")
              }
              className="h-10 rounded-xl border border-slate-300 px-3 text-sm outline-none transition focus:border-slate-900"
            >
              <option value="all">Calls e puts</option>
              <option value="call">Somente calls</option>
              <option value="put">Somente puts</option>
            </select>

            <input
              value={textFilter}
              onChange={(event) => setTextFilter(event.target.value)}
              placeholder="Filtrar por código ou strike"
              className="h-10 rounded-xl border border-slate-300 px-3 text-sm uppercase outline-none transition focus:border-slate-900"
            />
          </div>

          <div className="mb-3 text-sm text-slate-500">
            {filteredOptions.length} opção(ões) encontrada(s)
          </div>

          <div className="max-h-[520px] overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="px-3 py-3 font-semibold">Código</th>
                  <th className="px-3 py-3 font-semibold">Tipo</th>
                  <th className="px-3 py-3 font-semibold">Strike</th>
                  <th className="px-3 py-3 font-semibold">Vencimento</th>
                  <th className="px-3 py-3 font-semibold">Último</th>
                  <th className="px-3 py-3 font-semibold">Bid</th>
                  <th className="px-3 py-3 font-semibold">Ask</th>
                  <th className="px-3 py-3 font-semibold">Volume</th>
                  <th className="px-3 py-3 font-semibold">OI</th>
                  <th className="px-3 py-3 font-semibold">IV</th>
                  <th className="px-3 py-3 font-semibold"></th>
                </tr>
              </thead>

              <tbody>
                {filteredOptions.map((option) => {
                  const selected = selectedSymbol === option.symbol;

                  return (
                    <tr
                      key={option.symbol}
                      className={`border-b border-slate-100 transition hover:bg-slate-50 ${
                        selected ? "bg-emerald-50" : "bg-white"
                      }`}
                    >
                      <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-900">
                        {option.symbol}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            option.type === "call"
                              ? "bg-green-100 text-green-700"
                              : option.type === "put"
                              ? "bg-red-100 text-red-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {option.type === "call"
                            ? "CALL"
                            : option.type === "put"
                            ? "PUT"
                            : "-"}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                        {formatMoney(option.strike)}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                        {formatDate(option.expirationDate)}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                        {formatMoney(option.lastPrice)}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                        {formatMoney(option.bid)}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                        {formatMoney(option.ask)}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                        {formatNumber(option.volume)}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                        {formatNumber(option.openInterest)}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                        {formatPercent(option.impliedVolatility)}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleSelect(option)}
                          className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                            selected
                              ? "bg-emerald-600 text-white"
                              : "bg-slate-900 text-white hover:bg-slate-800"
                          }`}
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
                      colSpan={11}
                      className="px-3 py-8 text-center text-sm text-slate-500"
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
    </div>
  );
}
