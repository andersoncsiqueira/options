import type { OptionType } from "../models/Leg";

export const TRADING_DAYS_PER_YEAR = 252;

export interface BlackScholesInput {
  optionType: OptionType;
  S: number;
  K: number;

  /**
   * Tempo até o vencimento em anos.
   *
   * Para a convenção de dias úteis, use:
   * T = diasUteisAteVencimento / 252
   *
   * Preferencialmente, obtenha esse valor com businessDaysToYears().
   */
  T: number;

  /** Taxa livre de risco anual em formato decimal. Ex.: 14,5% = 0.145 */
  r: number;

  /** Volatilidade anual em formato decimal. Ex.: 25,93% = 0.2593 */
  sigma: number;
}

export interface DateBasedBlackScholesInput
  extends Omit<BlackScholesInput, "T"> {
  valuationDate: string | Date;
  expirationDate: string | Date;

  /**
   * Datas sem pregão no formato YYYY-MM-DD.
   *
   * Finais de semana já são excluídos automaticamente.
   * Passe aqui os feriados da B3 para obter a contagem exata.
   */
  holidays?: readonly string[];
}

export interface TimeToExpirationResult {
  businessDays: number;
  T: number;
}

/**
 * Converte string YYYY-MM-DD ou Date para uma data UTC sem componente de hora.
 * Isso evita erros de fuso horário ao calcular a diferença entre datas.
 */
function toUtcDateOnly(value: string | Date): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error("Data inválida.");
    }

    return new Date(
      Date.UTC(
        value.getUTCFullYear(),
        value.getUTCMonth(),
        value.getUTCDate(),
      ),
    );
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    throw new Error(
      `Data inválida: "${value}". Use o formato YYYY-MM-DD.`,
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Data inválida: "${value}".`);
  }

  return date;
}

function toDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Retorna true quando a data é um dia útil de negociação.
 *
 * Por padrão, exclui sábado e domingo.
 * Feriados da B3 podem ser informados no parâmetro holidays.
 */
export function isBusinessDay(
  value: string | Date,
  holidays: readonly string[] = [],
): boolean {
  const date = toUtcDateOnly(value);
  const weekDay = date.getUTCDay();

  if (weekDay === 0 || weekDay === 6) {
    return false;
  }

  const holidaySet = new Set(holidays);
  return !holidaySet.has(toDateKey(date));
}

/**
 * Conta os dias úteis entre a data de avaliação e o vencimento.
 *
 * Convenção usada:
 * - não conta o dia da avaliação;
 * - conta o dia do vencimento, caso seja dia útil;
 * - exclui sábados, domingos e os feriados informados.
 *
 * Exemplo:
 * 17/06/2026 até 17/07/2026 = 22 dias úteis,
 * quando não há feriados de bolsa no intervalo.
 */
export function countBusinessDays(
  valuationDate: string | Date,
  expirationDate: string | Date,
  holidays: readonly string[] = [],
): number {
  const start = toUtcDateOnly(valuationDate);
  const end = toUtcDateOnly(expirationDate);

  if (end.getTime() <= start.getTime()) {
    return 0;
  }

  const holidaySet = new Set(holidays);
  const cursor = new Date(start);
  let businessDays = 0;

  // Começa no dia seguinte à avaliação e inclui o vencimento.
  cursor.setUTCDate(cursor.getUTCDate() + 1);

  while (cursor.getTime() <= end.getTime()) {
    const weekDay = cursor.getUTCDay();
    const isWeekend = weekDay === 0 || weekDay === 6;
    const isHoliday = holidaySet.has(toDateKey(cursor));

    if (!isWeekend && !isHoliday) {
      businessDays += 1;
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return businessDays;
}

/**
 * Converte o prazo entre duas datas para anos usando a base de 252 pregões.
 */
export function businessDaysToYears(
  valuationDate: string | Date,
  expirationDate: string | Date,
  holidays: readonly string[] = [],
): TimeToExpirationResult {
  const businessDays = countBusinessDays(
    valuationDate,
    expirationDate,
    holidays,
  );

  return {
    businessDays,
    T: businessDays / TRADING_DAYS_PER_YEAR,
  };
}

export function normCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);

  let p =
    d *
    t *
    (0.3193815 +
      t *
        (-0.3565638 +
          t * (1.781478 + t * (-1.821256 + t * 1.330274))));

  if (x > 0) p = 1 - p;

  return p;
}

export function normPDF(x: number): number {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
}

export function blackScholesPrice(input: BlackScholesInput): number {
  const { optionType, S, K, T, r, sigma } = input;

  if (
    !Number.isFinite(S) ||
    !Number.isFinite(K) ||
    !Number.isFinite(T) ||
    !Number.isFinite(r) ||
    !Number.isFinite(sigma) ||
    S <= 0 ||
    K <= 0 ||
    sigma <= 0
  ) {
    return 0;
  }

  if (T <= 0) {
    return optionType === "call"
      ? Math.max(S - K, 0)
      : Math.max(K - S, 0);
  }

  const sqrtT = Math.sqrt(T);

  const d1 =
    (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) /
    (sigma * sqrtT);

  const d2 = d1 - sigma * sqrtT;

  if (optionType === "call") {
    return S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
  }

  return K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1);
}

/**
 * Calcula o preço diretamente a partir das datas.
 * Esta função impede que dias corridos sejam divididos por 252 por engano.
 */
export function blackScholesPriceFromDates(
  input: DateBasedBlackScholesInput,
): number {
  const {
    valuationDate,
    expirationDate,
    holidays = [],
    ...blackScholesInput
  } = input;

  const { T } = businessDaysToYears(
    valuationDate,
    expirationDate,
    holidays,
  );

  return blackScholesPrice({
    ...blackScholesInput,
    T,
  });
}

export function calculateGreeks(input: BlackScholesInput) {
  const { optionType, S, K, T, r, sigma } = input;

  if (
    !Number.isFinite(S) ||
    !Number.isFinite(K) ||
    !Number.isFinite(T) ||
    !Number.isFinite(r) ||
    !Number.isFinite(sigma) ||
    S <= 0 ||
    K <= 0 ||
    sigma <= 0 ||
    T <= 0
  ) {
    return {
      delta: 0,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
    };
  }

  const sqrtT = Math.sqrt(T);

  const d1 =
    (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) /
    (sigma * sqrtT);

  const d2 = d1 - sigma * sqrtT;
  const pdfD1 = normPDF(d1);

  const delta =
    optionType === "call"
      ? normCDF(d1)
      : normCDF(d1) - 1;

  const gamma = pdfD1 / (S * sigma * sqrtT);

  const thetaAnnual =
    optionType === "call"
      ? -((S * pdfD1 * sigma) / (2 * sqrtT)) -
        r * K * Math.exp(-r * T) * normCDF(d2)
      : -((S * pdfD1 * sigma) / (2 * sqrtT)) +
        r * K * Math.exp(-r * T) * normCDF(-d2);

  const vega = S * pdfD1 * sqrtT;

  const rho =
    optionType === "call"
      ? K * T * Math.exp(-r * T) * normCDF(d2)
      : -K * T * Math.exp(-r * T) * normCDF(-d2);

  return {
    delta,
    gamma,

    // Como T usa dias úteis / 252, o Theta diário também usa 252.
    theta: thetaAnnual / TRADING_DAYS_PER_YEAR,

    // Vega e Rho são retornados para variação de 1,00.
    // Para exibir por 1 ponto percentual, divida por 100 na interface.
    vega,
    rho,
  };
}

/**
 * Calcula as gregas diretamente a partir das datas.
 */
export function calculateGreeksFromDates(
  input: DateBasedBlackScholesInput,
) {
  const {
    valuationDate,
    expirationDate,
    holidays = [],
    ...blackScholesInput
  } = input;

  const { T } = businessDaysToYears(
    valuationDate,
    expirationDate,
    holidays,
  );

  return calculateGreeks({
    ...blackScholesInput,
    T,
  });
}
