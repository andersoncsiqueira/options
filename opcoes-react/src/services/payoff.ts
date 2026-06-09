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

  const sign = leg.direction === "buy" ? 1 : -1;

  return (intrinsic - leg.premium) * leg.quantity * sign;
}

export function generatePayoffPoints(
  legs: Leg[],
  currentUnderlyingPrice: number
): PayoffPoint[] {
  const strikes = legs.map((leg) => leg.strike);

  const minStrike = Math.min(...strikes);
  const maxStrike = Math.max(...strikes);

  const minPrice = Math.max(0, minStrike * 0.6);
  const maxPrice = maxStrike * 1.4;

  const steps = 60;
  const stepSize = (maxPrice - minPrice) / steps;

  const points: PayoffPoint[] = [];

  for (let i = 0; i <= steps; i++) {
    const price = minPrice + stepSize * i;

    const pnl = legs.reduce((total, leg) => {
      return total + calculateLegPayoffAtPrice(leg, price);
    }, 0);

    points.push({
      price: Number(price.toFixed(2)),
      pnl: Number(pnl.toFixed(2)),
    });
  }

  const currentPnl = legs.reduce((total, leg) => {
    return total + calculateLegPayoffAtPrice(leg, currentUnderlyingPrice);
  }, 0);

  points.push({
    price: Number(currentUnderlyingPrice.toFixed(2)),
    pnl: Number(currentPnl.toFixed(2)),
  });

  return points.sort((a, b) => a.price - b.price);
}