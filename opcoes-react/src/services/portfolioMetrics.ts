import type { Operation } from "../models/Operation";
import { calculateOperationPayoffAtPrice } from "./payoff";
import { calculateOperationTheoreticalValue } from "./operationPricing";
import { calculateGreeks } from "./blackScholes";

export function calculatePortfolioMetrics(
  operations: Operation[],
  currentPrices: Record<string, number>,
  daysToExpiration: number
) {
  return operations.reduce(
    (totals, operation) => {
      const currentPrice = currentPrices[operation.symbol] ?? 0;

      totals.pnl += calculateOperationPayoffAtPrice(
        operation.legs,
        currentPrice
      );

      totals.theoreticalValue += calculateOperationTheoreticalValue(
        operation,
        currentPrice,
        daysToExpiration
      );

      operation.legs.forEach((leg) => {
        const greeks = calculateGreeks({
          optionType: leg.optionType,
          S: currentPrice,
          K: leg.strike,
          T: daysToExpiration / 252,
          r: operation.riskFreeRate,
          sigma: operation.volatility,
        });

        const direction = leg.direction === "buy" ? 1 : -1;

        totals.delta += greeks.delta * leg.quantity * direction;
        totals.gamma += greeks.gamma * leg.quantity * direction;
        totals.theta += greeks.theta * leg.quantity * direction;
        totals.vega += greeks.vega * leg.quantity * direction;
      });

      return totals;
    },
    {
      pnl: 0,
      theoreticalValue: 0,
      delta: 0,
      gamma: 0,
      theta: 0,
      vega: 0,
    }
  );
}