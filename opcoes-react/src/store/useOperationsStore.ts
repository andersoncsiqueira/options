import { create } from "zustand";
import type { Operation } from "../models/Operation";

interface OperationsState {
  operations: Operation[];

  addOperation: (operation: Operation) => void;
  removeOperation: (id: string) => void;
  clearOperations: () => void;
}

function loadOperations(): Operation[] {
  const raw = localStorage.getItem("operations");

  if (!raw) return [];

  try {
    return JSON.parse(raw) as Operation[];
  } catch {
    return [];
  }
}

function saveOperations(operations: Operation[]) {
  localStorage.setItem("operations", JSON.stringify(operations));
}

export const useOperationsStore = create<OperationsState>((set) => ({
  operations: loadOperations(),

  addOperation: (operation) =>
    set((state) => {
      const updated = [...state.operations, operation];
      saveOperations(updated);

      return {
        operations: updated,
      };
    }),

  removeOperation: (id) =>
    set((state) => {
      const updated = state.operations.filter((operation) => operation.id !== id);
      saveOperations(updated);

      return {
        operations: updated,
      };
    }),

  clearOperations: () =>
    set(() => {
      saveOperations([]);

      return {
        operations: [],
      };
    }),
}));