import { create } from "zustand";
import type { Leg } from "../models/Leg";

interface OperationDraftState {
  name: string;
  symbol: string;
  expirationDate: string;
  volatility: number;
  riskFreeRate: number;

  legs: Leg[];

  setName: (value: string) => void;
  setSymbol: (value: string) => void;
  setExpirationDate: (value: string) => void;
  setVolatility: (value: number) => void;
  setRiskFreeRate: (value: number) => void;

  addLeg: (leg: Leg) => void;

  updateLeg: (id: string, leg: Partial<Leg>) => void;

  removeLeg: (id: string) => void;

  clear: () => void;
}

const initialState = {

  name: "",

  symbol: "PETR4",

  expirationDate: "",

  volatility: 0.25,

  riskFreeRate: 0.15,

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

  clear: () =>
    set({
      ...initialState,
    }),
}));