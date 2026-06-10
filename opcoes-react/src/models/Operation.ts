import type { Leg } from "./Leg";

export interface Operation {
  id: string;
  name: string;
  symbol: string;

  createdAt: string;
  expirationDate: string;

  volatility: number;
  riskFreeRate: number;

  legs: Leg[];

  notes?: string;
  tags?: string[];
}