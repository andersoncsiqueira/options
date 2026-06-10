import { create } from "zustand";
import type { Leg } from "../models/Leg";
import type { Operation } from "../models/Operation";

interface OperationDraftState {
  name: string;
  symbol: string;
  expirationDate: string;
  volatility: number;
  riskFreeRate: number;
  currentPrice: number;

  legs: Leg[];

  setName: (value: string) => void;
  setSymbol: (value: string) => void;
  setExpirationDate: (value: string) => void;
  setVolatility: (value: number) => void;
  setRiskFreeRate: (value: number) => void;
  setCurrentPrice: (value: number) => void;

  addLeg: (leg: Leg) => void;
  updateLeg: (id: string, leg: Partial<Leg>) => void;
  removeLeg: (id: string) => void;

  loadFromOperation: (operation: Operation, currentPrice: number) => void;

  clear: () => void;
}

const initialState = {
  name: "",
  symbol: "PETR4",
  expirationDate: "",
  volatility: 0.25,
  riskFreeRate: 0.15,
  currentPrice: 100,
  legs: [],
};

export const useOperationDraftStore = create<OperationDraftState>((set) => ({
  ...initialState,

  setName: (value) =>
    set({
      name: value,
    }),

  setSymbol: (value) =>
    set({
      symbol: value,
    }),

  setExpirationDate: (value) =>
    set({
      expirationDate: value,
    }),

  setVolatility: (value) =>
    set({
      volatility: value,
    }),

  setRiskFreeRate: (value) =>
    set({
      riskFreeRate: value,
    }),

  setCurrentPrice: (value) =>
    set({
      currentPrice: value,
    }),

  addLeg: (leg) =>
    set((state) => ({
      legs: [...state.legs, leg],
    })),

  updateLeg: (id, values) =>
    set((state) => ({
      legs: state.legs.map((leg) =>
        leg.id === id
          ? {
              ...leg,
              ...values,
            }
          : leg
      ),
    })),

  removeLeg: (id) =>
    set((state) => ({
      legs: state.legs.filter((leg) => leg.id !== id),
    })),

  loadFromOperation: (operation, currentPrice) =>
    set({
      name: operation.name,
      symbol: operation.symbol,
      expirationDate: operation.expirationDate,
      volatility: operation.volatility,
      riskFreeRate: operation.riskFreeRate,
      currentPrice,
      legs: operation.legs,
    }),

  clear: () =>
    set({
      ...initialState,
    }),
}));