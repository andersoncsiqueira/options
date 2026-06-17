import type { Operation } from "../models/Operation";
import { blackScholesPrice } from "./blackScholes";

export function calculateNegotiatedCashFlow(operation: Operation): number {
  return operation.legs.reduce((total, leg) => {
    const direction = leg.direction === "buy" ? -1 : 1;

    return total + leg.premium * leg.quantity * direction;
  }, 0);
}

export function calculateOperationTheoreticalValue(
  operation: Operation,
  currentPrice: number,
  daysToExpiration: number
): number {
  return operation.legs.reduce((total, leg) => {
    const bsPrice = blackScholesPrice({
      optionType: leg.optionType,
      S: currentPrice,
      K: leg.strike,
      T: daysToExpiration / 252,
      r: operation.riskFreeRate,
      sigma: operation.volatility,
    });

    const direction = leg.direction === "buy" ? 1 : -1;

    return total + bsPrice * leg.quantity * direction;
  }, 0);
}

export function calculateOperationMispricing(
  operation: Operation,
  currentPrice: number,
  daysToExpiration: number
) {
  const negotiatedCashFlow = calculateNegotiatedCashFlow(operation);

  const theoreticalValue = calculateOperationTheoreticalValue(
    operation,
    currentPrice,
    daysToExpiration
  );

  const difference = theoreticalValue + negotiatedCashFlow;

  let status: "barata" | "cara" | "justa" = "justa";

  if (difference > 0) status = "barata";
  if (difference < 0) status = "cara";

  return {
    negotiatedCashFlow,
    theoreticalValue,
    difference,
    status,
  };
}