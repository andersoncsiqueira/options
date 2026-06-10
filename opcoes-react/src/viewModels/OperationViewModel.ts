import type { Operation } from "../models/Operation";
import type { Greeks } from "../models/Greeks";
import type { PayoffPoint } from "../services/payoff";

export interface OperationViewModel {
  operation: Operation;

  currentPrice: number;

  negotiatedValue: number;

  theoreticalValue: number;

  mispricing: number;

  status: "barata" | "cara" | "justa";

  pnl: number;

  greeks: Greeks;

  payoff: PayoffPoint[];
}