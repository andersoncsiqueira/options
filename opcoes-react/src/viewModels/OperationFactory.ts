import type { Operation } from "../models/Operation";
import type { OperationViewModel } from "./OperationViewModel";

import { calculateOperationMispricing } from "../services/operationPricing";

import {
  calculateOperationPayoffAtPrice,
  generatePayoffPoints,
  calculateMaxProfit,
  calculateMaxLoss,
  calculateBreakEvens,
} from "../services/payoff";

import { calculateGreeks } from "../services/blackScholes";

export function buildOperationViewModel(
  operation: Operation,
  currentPrice: number,
  daysToExpiration: number
): OperationViewModel {
  const pricing = calculateOperationMispricing(
    operation,
    currentPrice,
    daysToExpiration
  );

  const pnl = calculateOperationPayoffAtPrice(operation.legs, currentPrice);

  const payoff = generatePayoffPoints(operation.legs, currentPrice);

  let delta = 0;
  let gamma = 0;
  let theta = 0;
  let vega = 0;
  let rho = 0;

  operation.legs.forEach((leg) => {
    const greeks = calculateGreeks({
      optionType: leg.optionType,
      S: currentPrice,
      K: leg.strike,
      T: daysToExpiration / 252,
      r: operation.riskFreeRate,
      sigma: operation.volatility,
    });

    const signal = leg.direction === "buy" ? 1 : -1;

    delta += greeks.delta * signal * leg.quantity;
    gamma += greeks.gamma * signal * leg.quantity;
    theta += greeks.theta * signal * leg.quantity;
    vega += greeks.vega * signal * leg.quantity;
    rho += greeks.rho * signal * leg.quantity;
  });

  return {
    operation,

    currentPrice,

    negotiatedValue: pricing.negotiatedCashFlow,

    theoreticalValue: pricing.theoreticalValue,

    mispricing: pricing.difference,

    status: pricing.status,

    pnl,

    greeks: {
      delta,
      gamma,
      theta,
      vega,
      rho,
    },

    payoff,

    maxProfit: calculateMaxProfit(payoff, operation.legs),

maxLoss: calculateMaxLoss(payoff, operation.legs),

    breakEvens: calculateBreakEvens(payoff),
  };
}