import { create } from "zustand";

import type { Operation } from "../models/Operation";
import { supabase } from "../lib/supabase";

const LOCAL_STORAGE_KEY = "operations";
const MIGRATION_KEY = "operations_supabase_migration_v3_complete";

interface OperationRow {
  id: string;
  payload: Operation | null;
  updated_at: string | null;
}

interface OperationsState {
  operations: Operation[];

  isLoading: boolean;
  isSyncing: boolean;
  initialized: boolean;

  syncError: string | null;
  lastSyncedAt: string | null;

  initialize: () => void;
  syncOperations: () => Promise<void>;

  addOperation: (operation: Operation) => void;
  updateOperation: (id: string, operation: Operation) => void;
  removeOperation: (id: string) => void;
  clearOperations: () => void;

  getOperationById: (id: string) => Operation | undefined;
  clearSyncError: () => void;
}

function readLocalOperations(): Operation[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? (parsed as Operation[]) : [];
  } catch (error) {
    console.error(
      "[useOperationsStore] Não foi possível ler as operações locais:",
      error
    );

    return [];
  }
}

function saveLocalOperations(operations: Operation[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    LOCAL_STORAGE_KEY,
    JSON.stringify(operations)
  );
}

function migrationWasCompleted(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(MIGRATION_KEY) === "true";
}

function markMigrationAsCompleted(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(MIGRATION_KEY, "true");
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "Erro desconhecido ao sincronizar as operações.";
}

function rowToOperation(row: OperationRow): Operation | null {
  if (!row.payload || typeof row.payload !== "object") {
    return null;
  }

  return {
    ...row.payload,
    id: row.id,
  };
}

async function fetchRemoteOperations(): Promise<Operation[]> {
  const { data, error } = await supabase
    .from("operations")
    .select("id, payload, updated_at")
    .order("updated_at", {
      ascending: false,
    });

  if (error) {
    throw error;
  }

  return ((data ?? []) as OperationRow[])
    .map(rowToOperation)
    .filter(
      (operation): operation is Operation => operation !== null
    );
}

async function upsertOperation(operation: Operation): Promise<void> {
  const { error } = await supabase.from("operations").upsert(
    {
      id: operation.id,
      payload: operation,
    },
    {
      onConflict: "id",
    }
  );

  if (error) {
    throw error;
  }
}

async function upsertOperations(
  operations: Operation[]
): Promise<void> {
  if (operations.length === 0) {
    return;
  }

  const { error } = await supabase.from("operations").upsert(
    operations.map((operation) => ({
      id: operation.id,
      payload: operation,
    })),
    {
      onConflict: "id",
    }
  );

  if (error) {
    throw error;
  }
}

async function deleteRemoteOperation(id: string): Promise<void> {
  const { error } = await supabase
    .from("operations")
    .delete()
    .eq("id", id);

  if (error) {
    throw error;
  }
}

async function deleteAllRemoteOperations(): Promise<void> {
  const { error } = await supabase
    .from("operations")
    .delete()
    .not("id", "is", null);

  if (error) {
    throw error;
  }
}

let browserListenersRegistered = false;

export const useOperationsStore = create<OperationsState>((set, get) => ({
  operations: readLocalOperations(),

  isLoading: false,
  isSyncing: false,
  initialized: false,

  syncError: null,
  lastSyncedAt: null,

  initialize: () => {
    if (!get().initialized) {
      set({
        initialized: true,
      });
    }

    if (
      typeof window !== "undefined" &&
      !browserListenersRegistered
    ) {
      browserListenersRegistered = true;

      window.addEventListener("online", () => {
        void get().syncOperations();
      });

      window.addEventListener("focus", () => {
        void get().syncOperations();
      });
    }

    void get().syncOperations();
  },

  syncOperations: async () => {
    if (get().isSyncing) {
      return;
    }

    set({
      isLoading: !get().initialized,
      isSyncing: true,
      syncError: null,
    });

    try {
      const localOperations = readLocalOperations();
      let remoteOperations = await fetchRemoteOperations();

      if (!migrationWasCompleted() && localOperations.length > 0) {
        const remoteIds = new Set(
          remoteOperations.map((operation) => operation.id)
        );

        const operationsToMigrate =
          remoteOperations.length === 0
            ? localOperations
            : localOperations.filter(
                (operation) => !remoteIds.has(operation.id)
              );

        if (operationsToMigrate.length > 0) {
          console.log(
            `[useOperationsStore] Enviando ${operationsToMigrate.length} operação(ões) local(is) para o Supabase.`
          );

          await upsertOperations(operationsToMigrate);
          remoteOperations = await fetchRemoteOperations();
        }

        markMigrationAsCompleted();
      }

      saveLocalOperations(remoteOperations);

      set({
        operations: remoteOperations,
        initialized: true,
        isLoading: false,
        syncError: null,
        lastSyncedAt: new Date().toISOString(),
      });

      console.log(
        `[useOperationsStore] Sincronização concluída: ${remoteOperations.length} operação(ões).`
      );
    } catch (error) {
      const message = getErrorMessage(error);

      console.error(
        "[useOperationsStore] Erro ao sincronizar operações:",
        error
      );

      set({
        operations: readLocalOperations(),
        initialized: true,
        isLoading: false,
        syncError: message,
      });
    } finally {
      set({
        isLoading: false,
        isSyncing: false,
      });
    }
  },

  addOperation: (operation) => {
    const currentOperations = get().operations;

    const updatedOperations = currentOperations.some(
      (item) => item.id === operation.id
    )
      ? currentOperations.map((item) =>
          item.id === operation.id ? operation : item
        )
      : [...currentOperations, operation];

    saveLocalOperations(updatedOperations);

    set({
      operations: updatedOperations,
      syncError: null,
    });

    void upsertOperation(operation)
      .then(() => {
        set({
          lastSyncedAt: new Date().toISOString(),
        });
      })
      .catch((error: unknown) => {
        const message = getErrorMessage(error);

        console.error(
          "[useOperationsStore] Erro ao salvar operação no Supabase:",
          error
        );

        set({
          syncError: message,
        });
      });
  },

  updateOperation: (id, operation) => {
    const normalizedOperation: Operation = {
      ...operation,
      id,
    };

    const currentOperations = get().operations;

    const updatedOperations = currentOperations.some(
      (item) => item.id === id
    )
      ? currentOperations.map((item) =>
          item.id === id ? normalizedOperation : item
        )
      : [...currentOperations, normalizedOperation];

    saveLocalOperations(updatedOperations);

    set({
      operations: updatedOperations,
      syncError: null,
    });

    void upsertOperation(normalizedOperation)
      .then(() => {
        set({
          lastSyncedAt: new Date().toISOString(),
        });
      })
      .catch((error: unknown) => {
        const message = getErrorMessage(error);

        console.error(
          "[useOperationsStore] Erro ao atualizar operação no Supabase:",
          error
        );

        set({
          syncError: message,
        });
      });
  },

  removeOperation: (id) => {
    const updatedOperations = get().operations.filter(
      (operation) => operation.id !== id
    );

    saveLocalOperations(updatedOperations);

    set({
      operations: updatedOperations,
      syncError: null,
    });

    void deleteRemoteOperation(id)
      .then(() => {
        set({
          lastSyncedAt: new Date().toISOString(),
        });
      })
      .catch((error: unknown) => {
        const message = getErrorMessage(error);

        console.error(
          "[useOperationsStore] Erro ao excluir operação no Supabase:",
          error
        );

        set({
          syncError: message,
        });
      });
  },

  clearOperations: () => {
    saveLocalOperations([]);

    set({
      operations: [],
      syncError: null,
    });

    void deleteAllRemoteOperations()
      .then(() => {
        set({
          lastSyncedAt: new Date().toISOString(),
        });
      })
      .catch((error: unknown) => {
        const message = getErrorMessage(error);

        console.error(
          "[useOperationsStore] Erro ao limpar operações no Supabase:",
          error
        );

        set({
          syncError: message,
        });
      });
  },

  getOperationById: (id) => {
    return get().operations.find(
      (operation) => operation.id === id
    );
  },

  clearSyncError: () => {
    set({
      syncError: null,
    });
  },
}));

if (typeof window !== "undefined") {
  window.setTimeout(() => {
    useOperationsStore.getState().initialize();
  }, 0);
}
