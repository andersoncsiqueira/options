import type { Leg } from "../models/Leg";

export interface PayoffPoint {
  price: number;
  pnl: number;
}

export function calculateLegPayoffAtPrice(
  leg: Leg,
  underlyingPrice: number
): number {
  const intrinsic =
    leg.optionType === "call"
      ? Math.max(underlyingPrice - leg.strike, 0)
      : Math.max(leg.strike - underlyingPrice, 0);

  const directionMultiplier = leg.direction === "buy" ? 1 : -1;

  return (intrinsic - leg.premium) * leg.quantity * directionMultiplier;
}

export function calculateOperationPayoffAtPrice(
  legs: Leg[],
  underlyingPrice: number
): number {
  return legs.reduce((total, leg) => {
    return total + calculateLegPayoffAtPrice(leg, underlyingPrice);
  }, 0);
}

export function generatePayoffPoints(
  legs: Leg[],
  currentUnderlyingPrice: number
): PayoffPoint[] {
  if (legs.length === 0) return [];

  const strikes = legs.map((leg) => leg.strike);

  const minStrike = Math.min(...strikes);
  const maxStrike = Math.max(...strikes);

  const minPrice = Math.max(
    0,
    Math.min(minStrike, currentUnderlyingPrice) * 0.75
  );

  const maxPrice = Math.max(maxStrike, currentUnderlyingPrice) * 1.35;

  const importantPrices = new Set<number>();

  importantPrices.add(minPrice);
  importantPrices.add(maxPrice);
  importantPrices.add(currentUnderlyingPrice);

  for (const strike of strikes) {
    importantPrices.add(strike);
    importantPrices.add(strike - 0.01);
    importantPrices.add(strike + 0.01);
  }

  const steps = 60;
  const stepSize = (maxPrice - minPrice) / steps;

  for (let i = 0; i <= steps; i++) {
    importantPrices.add(minPrice + stepSize * i);
  }

  const points = Array.from(importantPrices)
    .filter((price) => price >= minPrice && price <= maxPrice)
    .sort((a, b) => a - b)
    .map((price) => ({
      price: Number(price.toFixed(2)),
      pnl: Number(calculateOperationPayoffAtPrice(legs, price).toFixed(2)),
    }));

  return points.filter(
    (point, index, array) =>
      index === 0 || point.price !== array[index - 1].price
  );
}

function calculateUpsideCallExposure(legs: Leg[]): number {
  return legs.reduce((total, leg) => {
    if (leg.optionType !== "call") return total;

    const direction = leg.direction === "buy" ? 1 : -1;

    return total + direction * leg.quantity;
  }, 0);
}

export function calculateMaxProfit(
  points: PayoffPoint[],
  legs: Leg[]
): number | "ilimitado" {
  if (points.length === 0) return 0;

  const upsideCallExposure = calculateUpsideCallExposure(legs);

  if (upsideCallExposure > 0) {
    return "ilimitado";
  }

  const max = Math.max(...points.map((point) => point.pnl));

  return Number(max.toFixed(2));
}

export function calculateMaxLoss(
  points: PayoffPoint[],
  legs: Leg[]
): number | "ilimitado" {
  if (points.length === 0) return 0;

  const upsideCallExposure = calculateUpsideCallExposure(legs);

  if (upsideCallExposure < 0) {
    return "ilimitado";
  }

  const min = Math.min(...points.map((point) => point.pnl));

  return Number(min.toFixed(2));
}

export function calculateBreakEvens(points: PayoffPoint[]): number[] {
  const breakEvens: number[] = [];

  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const current = points[i];

    if (previous.pnl === 0) {
      breakEvens.push(previous.price);
      continue;
    }

    const crossesZero =
      (previous.pnl < 0 && current.pnl > 0) ||
      (previous.pnl > 0 && current.pnl < 0);

    if (crossesZero) {
      const priceDiff = current.price - previous.price;
      const pnlDiff = current.pnl - previous.pnl;

      if (pnlDiff === 0) continue;

      const estimatedPrice =
        previous.price + ((0 - previous.pnl) / pnlDiff) * priceDiff;

      breakEvens.push(Number(estimatedPrice.toFixed(2)));
    }
  }

  return Array.from(new Set(breakEvens));
}