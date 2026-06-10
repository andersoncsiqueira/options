import { create } from "zustand";

interface MarketDataState {
  prices: Record<string, number>;

  setPrice: (symbol: string, price: number) => void;
  clearPrices: () => void;
}

function loadPrices(): Record<string, number> {
  const raw = localStorage.getItem("market-prices");

  if (!raw) {
    return {
      PETR4: 100,
      VALE3: 60,
      ITUB4: 35,
    };
  }

  try {
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {
      PETR4: 100,
      VALE3: 60,
      ITUB4: 35,
    };
  }
}

function savePrices(prices: Record<string, number>) {
  localStorage.setItem("market-prices", JSON.stringify(prices));
}

export const useMarketDataStore = create<MarketDataState>((set) => ({
  prices: loadPrices(),

  setPrice: (symbol, price) =>
    set((state) => {
      const normalizedSymbol = symbol.toUpperCase();

      const updated = {
        ...state.prices,
        [normalizedSymbol]: price,
      };

      savePrices(updated);

      return {
        prices: updated,
      };
    }),

  clearPrices: () =>
    set(() => {
      const initial = {
        PETR4: 100,
        VALE3: 60,
        ITUB4: 35,
      };

      savePrices(initial);

      return {
        prices: initial,
      };
    }),
}));