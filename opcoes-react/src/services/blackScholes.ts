import type { OptionType } from "../models/Leg";

interface BlackScholesInput {
  optionType: OptionType;
  S: number;
  K: number;
  T: number;
  r: number;
  sigma: number;
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

  if (S <= 0 || K <= 0 || sigma <= 0) return 0;

  if (T <= 0) {
    return optionType === "call"
      ? Math.max(S - K, 0)
      : Math.max(K - S, 0);
  }

  const d1 =
    (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) /
    (sigma * Math.sqrt(T));

  const d2 = d1 - sigma * Math.sqrt(T);

  if (optionType === "call") {
    return S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
  }

  return K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1);
}

export function calculateGreeks(input: BlackScholesInput) {
  const { optionType, S, K, T, r, sigma } = input;

  if (S <= 0 || K <= 0 || sigma <= 0 || T <= 0) {
    return {
      delta: 0,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
    };
  }

  const d1 =
    (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) /
    (sigma * Math.sqrt(T));

  const d2 = d1 - sigma * Math.sqrt(T);
  const pdfD1 = normPDF(d1);

  const delta =
    optionType === "call"
      ? normCDF(d1)
      : normCDF(d1) - 1;

  const gamma = pdfD1 / (S * sigma * Math.sqrt(T));

  const thetaAnnual =
    optionType === "call"
      ? -((S * pdfD1 * sigma) / (2 * Math.sqrt(T))) -
        r * K * Math.exp(-r * T) * normCDF(d2)
      : -((S * pdfD1 * sigma) / (2 * Math.sqrt(T))) +
        r * K * Math.exp(-r * T) * normCDF(-d2);

  const vega = S * pdfD1 * Math.sqrt(T);

  const rho =
    optionType === "call"
      ? K * T * Math.exp(-r * T) * normCDF(d2)
      : -K * T * Math.exp(-r * T) * normCDF(-d2);

  return {
    delta,
    gamma,
    theta: thetaAnnual / 365,
    vega,
    rho,
  };
}