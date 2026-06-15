import { create } from "zustand";

import type { Operation } from "../models/Operation";
import { supabase } from "../lib/supabase";

const LOCAL_STORAGE_KEY = "operations";

const PENDING_UPSERTS_KEY =
  "operations_pending_upserts_v4";

const PENDING_DELETES_KEY =
  "operations_pending_deletes_v4";

const PENDING_CLEAR_KEY =
  "operations_pending_clear_v4";

const LOCAL_MIGRATION_KEY =
  "operations_supabase_migration_v4_complete";

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

  initialize: () => Promise<void>;
  syncOperations: () => Promise<void>;

  addOperation: (
    operation: Operation
  ) => Promise<void>;

  updateOperation: (
    id: string,
    operation: Operation
  ) => Promise<void>;

  removeOperation: (
    id: string
  ) => Promise<void>;

  clearOperations: () => Promise<void>;

  getOperationById: (
    id: string
  ) => Operation | undefined;

  clearSyncError: () => void;
}

function readJson<T>(
  key: string,
  fallback: T
): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  const raw =
    window.localStorage.getItem(key);

  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error(
      `[useOperationsStore] Erro ao ler "${key}" do localStorage:`,
      error
    );

    return fallback;
  }
}

function writeJson(
  key: string,
  value: unknown
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    key,
    JSON.stringify(value)
  );
}

function loadLocalOperations(): Operation[] {
  const parsed = readJson<unknown>(
    LOCAL_STORAGE_KEY,
    []
  );

  return Array.isArray(parsed)
    ? (parsed as Operation[])
    : [];
}

function saveLocalOperations(
  operations: Operation[]
): void {
  writeJson(
    LOCAL_STORAGE_KEY,
    operations
  );
}

function loadPendingUpserts(): Operation[] {
  const parsed = readJson<unknown>(
    PENDING_UPSERTS_KEY,
    []
  );

  return Array.isArray(parsed)
    ? (parsed as Operation[])
    : [];
}

function savePendingUpserts(
  operations: Operation[]
): void {
  writeJson(
    PENDING_UPSERTS_KEY,
    operations
  );
}

function loadPendingDeletes(): string[] {
  const parsed = readJson<unknown>(
    PENDING_DELETES_KEY,
    []
  );

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(
    (item): item is string =>
      typeof item === "string"
  );
}

function savePendingDeletes(
  ids: string[]
): void {
  writeJson(
    PENDING_DELETES_KEY,
    ids
  );
}

function hasPendingClear(): boolean {
  return (
    readJson<boolean>(
      PENDING_CLEAR_KEY,
      false
    ) === true
  );
}

function setPendingClear(
  value: boolean
): void {
  writeJson(
    PENDING_CLEAR_KEY,
    value
  );
}

function migrationWasCompleted(): boolean {
  return (
    readJson<boolean>(
      LOCAL_MIGRATION_KEY,
      false
    ) === true
  );
}

function markMigrationAsCompleted(): void {
  writeJson(
    LOCAL_MIGRATION_KEY,
    true
  );
}

function queueUpsert(
  operation: Operation
): void {
  const pendingOperations =
    loadPendingUpserts();

  const nextPendingOperations =
    pendingOperations.some(
      (item) =>
        item.id === operation.id
    )
      ? pendingOperations.map(
          (item) =>
            item.id === operation.id
              ? operation
              : item
        )
      : [
          ...pendingOperations,
          operation,
        ];

  savePendingUpserts(
    nextPendingOperations
  );

  savePendingDeletes(
    loadPendingDeletes().filter(
      (id) =>
        id !== operation.id
    )
  );
}

function clearQueuedUpsert(
  operationId: string
): void {
  savePendingUpserts(
    loadPendingUpserts().filter(
      (operation) =>
        operation.id !== operationId
    )
  );
}

function queueDelete(
  operationId: string
): void {
  clearQueuedUpsert(operationId);

  const pendingDeletes =
    loadPendingDeletes();

  if (
    !pendingDeletes.includes(
      operationId
    )
  ) {
    savePendingDeletes([
      ...pendingDeletes,
      operationId,
    ]);
  }
}

function clearQueuedDelete(
  operationId: string
): void {
  savePendingDeletes(
    loadPendingDeletes().filter(
      (id) =>
        id !== operationId
    )
  );
}

function getErrorMessage(
  error: unknown
): string {
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

function normalizeOperation(
  operation: Operation
): Operation {
  return {
    ...operation,
    id: String(operation.id),
  };
}

function rowToOperation(
  row: OperationRow
): Operation | null {
  if (
    !row.payload ||
    typeof row.payload !== "object"
  ) {
    return null;
  }

  return normalizeOperation({
    ...row.payload,
    id: row.id,
  });
}

async function fetchRemoteOperations(): Promise<
  Operation[]
> {
  const {
    data,
    error,
  } =
    await supabase
      .from("operations")
      .select(
        "id, payload, updated_at"
      )
      .order(
        "updated_at",
        {
          ascending: false,
        }
      );

  if (error) {
    throw error;
  }

  return (
    (data ?? []) as OperationRow[]
  )
    .map(rowToOperation)
    .filter(
      (
        operation
      ): operation is Operation =>
        operation !== null
    );
}

async function upsertOperationRemote(
  operation: Operation
): Promise<void> {
  const normalizedOperation =
    normalizeOperation(operation);

  const { error } =
    await supabase
      .from("operations")
      .upsert(
        {
          id: normalizedOperation.id,
          payload:
            normalizedOperation,
        },
        {
          onConflict: "id",
        }
      );

  if (error) {
    throw error;
  }
}

async function upsertOperationsRemote(
  operations: Operation[]
): Promise<void> {
  if (
    operations.length === 0
  ) {
    return;
  }

  const normalizedOperations =
    operations.map(
      normalizeOperation
    );

  const { error } =
    await supabase
      .from("operations")
      .upsert(
        normalizedOperations.map(
          (operation) => ({
            id: operation.id,
            payload: operation,
          })
        ),
        {
          onConflict: "id",
        }
      );

  if (error) {
    throw error;
  }
}

async function deleteOperationRemote(
  operationId: string
): Promise<void> {
  const { error } =
    await supabase
      .from("operations")
      .delete()
      .eq(
        "id",
        operationId
      );

  if (error) {
    throw error;
  }
}

async function deleteAllOperationsRemote(): Promise<void> {
  const { error } =
    await supabase
      .from("operations")
      .delete()
      .not(
        "id",
        "is",
        null
      );

  if (error) {
    throw error;
  }
}

async function flushPendingChanges(): Promise<void> {
  if (hasPendingClear()) {
    await deleteAllOperationsRemote();

    setPendingClear(false);
    savePendingUpserts([]);
    savePendingDeletes([]);

    return;
  }

  const pendingDeletes =
    loadPendingDeletes();

  for (
    const operationId of pendingDeletes
  ) {
    await deleteOperationRemote(
      operationId
    );

    clearQueuedDelete(
      operationId
    );
  }

  const pendingUpserts =
    loadPendingUpserts();

  for (
    const operation of pendingUpserts
  ) {
    await upsertOperationRemote(
      operation
    );

    clearQueuedUpsert(
      operation.id
    );
  }
}

let browserListenersRegistered =
  false;

export const useOperationsStore =
  create<OperationsState>(
    (set, get) => ({
      operations:
        loadLocalOperations(),

      isLoading: false,
      isSyncing: false,
      initialized: false,

      syncError: null,
      lastSyncedAt: null,

      initialize:
        async () => {
          if (
            get().initialized ||
            get().isLoading
          ) {
            return;
          }

          set({
            isLoading: true,
            syncError: null,
          });

          try {
            await get().syncOperations();
          } finally {
            set({
              isLoading: false,
              initialized: true,
            });
          }

          if (
            typeof window !==
              "undefined" &&
            !browserListenersRegistered
          ) {
            browserListenersRegistered =
              true;

            window.addEventListener(
              "online",
              () => {
                void get().syncOperations();
              }
            );

            window.addEventListener(
              "focus",
              () => {
                void get().syncOperations();
              }
            );
          }
        },

      syncOperations:
        async () => {
          if (get().isSyncing) {
            return;
          }

          set({
            isSyncing: true,
            syncError: null,
          });

          try {
            /*
             * Primeiro envia alterações
             * feitas enquanto o Supabase
             * estava indisponível.
             */
            await flushPendingChanges();

            const localOperations =
              loadLocalOperations();

            let remoteOperations =
              await fetchRemoteOperations();

            /*
             * Migra somente uma vez as
             * operações antigas que já
             * existiam no localStorage
             * antes da integração.
             *
             * Operações que já existem
             * remotamente não são
             * sobrescritas pela versão
             * local antiga.
             */
            if (
              !migrationWasCompleted()
            ) {
              const remoteIds =
                new Set(
                  remoteOperations.map(
                    (operation) =>
                      operation.id
                  )
                );

              const localOnlyOperations =
                localOperations.filter(
                  (operation) =>
                    !remoteIds.has(
                      String(
                        operation.id
                      )
                    )
                );

              if (
                localOnlyOperations.length >
                0
              ) {
                await upsertOperationsRemote(
                  localOnlyOperations
                );

                remoteOperations =
                  await fetchRemoteOperations();
              }

              markMigrationAsCompleted();
            }

            /*
             * Depois da migração,
             * o Supabase passa a ser
             * a fonte principal.
             *
             * Isso faz as operações
             * aparecerem em qualquer
             * computador.
             */
            saveLocalOperations(
              remoteOperations
            );

            set({
              operations:
                remoteOperations,

              initialized: true,

              lastSyncedAt:
                new Date().toISOString(),

              syncError: null,
            });

            console.log(
              `[useOperationsStore] Sincronização concluída: ${remoteOperations.length} operação(ões).`
            );
          } catch (error) {
            const message =
              getErrorMessage(error);

            console.error(
              "[useOperationsStore] Erro ao sincronizar operações:",
              error
            );

            /*
             * Se o Supabase falhar,
             * mantém o cache local
             * disponível na interface.
             */
            set({
              operations:
                loadLocalOperations(),

              initialized: true,
              syncError: message,
            });
          } finally {
            set({
              isSyncing: false,
            });
          }
        },

      addOperation:
        async (operation) => {
          const normalizedOperation =
            normalizeOperation(
              operation
            );

          const currentOperations =
            get().operations;

          const updatedOperations =
            currentOperations.some(
              (item) =>
                item.id ===
                normalizedOperation.id
            )
              ? currentOperations.map(
                  (item) =>
                    item.id ===
                    normalizedOperation.id
                      ? normalizedOperation
                      : item
                )
              : [
                  ...currentOperations,
                  normalizedOperation,
                ];

          saveLocalOperations(
            updatedOperations
          );

          queueUpsert(
            normalizedOperation
          );

          set({
            operations:
              updatedOperations,
            syncError: null,
          });

          try {
            await upsertOperationRemote(
              normalizedOperation
            );

            clearQueuedUpsert(
              normalizedOperation.id
            );

            set({
              lastSyncedAt:
                new Date().toISOString(),
            });
          } catch (error) {
            const message =
              getErrorMessage(error);

            console.error(
              "[useOperationsStore] Erro ao salvar operação no Supabase:",
              error
            );

            /*
             * A operação permanece
             * na fila e será enviada
             * na próxima sincronização.
             */
            set({
              syncError: message,
            });
          }
        },

      updateOperation:
        async (
          id,
          operation
        ) => {
          const normalizedOperation =
            normalizeOperation({
              ...operation,
              id,
            });

          const currentOperations =
            get().operations;

          const updatedOperations =
            currentOperations.some(
              (item) =>
                item.id ===
                normalizedOperation.id
            )
              ? currentOperations.map(
                  (item) =>
                    item.id ===
                    normalizedOperation.id
                      ? normalizedOperation
                      : item
                )
              : [
                  ...currentOperations,
                  normalizedOperation,
                ];

          saveLocalOperations(
            updatedOperations
          );

          queueUpsert(
            normalizedOperation
          );

          set({
            operations:
              updatedOperations,
            syncError: null,
          });

          try {
            await upsertOperationRemote(
              normalizedOperation
            );

            clearQueuedUpsert(
              normalizedOperation.id
            );

            set({
              lastSyncedAt:
                new Date().toISOString(),
            });
          } catch (error) {
            const message =
              getErrorMessage(error);

            console.error(
              "[useOperationsStore] Erro ao atualizar operação no Supabase:",
              error
            );

            set({
              syncError: message,
            });
          }
        },

      removeOperation:
        async (id) => {
          const normalizedId =
            String(id);

          const updatedOperations =
            get().operations.filter(
              (operation) =>
                operation.id !==
                normalizedId
            );

          saveLocalOperations(
            updatedOperations
          );

          queueDelete(
            normalizedId
          );

          set({
            operations:
              updatedOperations,
            syncError: null,
          });

          try {
            await deleteOperationRemote(
              normalizedId
            );

            clearQueuedDelete(
              normalizedId
            );

            set({
              lastSyncedAt:
                new Date().toISOString(),
            });
          } catch (error) {
            const message =
              getErrorMessage(error);

            console.error(
              "[useOperationsStore] Erro ao excluir operação no Supabase:",
              error
            );

            set({
              syncError: message,
            });
          }
        },

      clearOperations:
        async () => {
          saveLocalOperations([]);
          savePendingUpserts([]);
          savePendingDeletes([]);
          setPendingClear(true);

          set({
            operations: [],
            syncError: null,
          });

          try {
            await deleteAllOperationsRemote();

            setPendingClear(false);

            set({
              lastSyncedAt:
                new Date().toISOString(),
            });
          } catch (error) {
            const message =
              getErrorMessage(error);

            console.error(
              "[useOperationsStore] Erro ao limpar operações no Supabase:",
              error
            );

            set({
              syncError: message,
            });
          }
        },

      getOperationById:
        (id) => {
          const normalizedId =
            String(id);

          return get().operations.find(
            (operation) =>
              operation.id ===
              normalizedId
          );
        },

      clearSyncError:
        () => {
          set({
            syncError: null,
          });
        },
    })
  );
