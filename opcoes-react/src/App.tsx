import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import DashboardPage from "./pages/DashboardPage";
import OperationsPage from "./pages/OperationsPage";
import CalculatorPage from "./pages/CalculatorPage";
import SettingsPage from "./pages/SettingsPage";
import NewOperationPage from "./pages/NewOperationPage";
import AssetAnalysisPage from "./pages/AssetAnalysisPage";

import { supabase } from "./lib/supabase";

type SyncState =
  | {
      type: "loading";
      message: string;
    }
  | {
      type: "success";
      message: string;
    }
  | {
      type: "error";
      message: string;
    };

interface LocalOperation {
  id?: string | number;
  [key: string]: unknown;
}

function readLocalOperations(): LocalOperation[] {
  const raw = window.localStorage.getItem("operations");

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);

    return Array.isArray(parsed)
      ? (parsed as LocalOperation[])
      : [];
  } catch {
    return [];
  }
}

function formatSupabaseError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return String(error);
  }

  const value = error as {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  };

  return [
    value.message,
    value.code ? `Código: ${value.code}` : "",
    value.details ? `Detalhes: ${value.details}` : "",
    value.hint ? `Dica: ${value.hint}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

function App() {
  const [syncState, setSyncState] =
    useState<SyncState>({
      type: "loading",
      message:
        "Testando conexão com o Supabase...",
    });

  useEffect(() => {
    let cancelled = false;

    async function migrateLocalOperations() {
      console.log(
        "[SUPABASE DIAGNÓSTICO] O App.tsx novo foi carregado."
      );

      try {
        const localOperations =
          readLocalOperations();

        console.log(
          "[SUPABASE DIAGNÓSTICO] Operações no localStorage:",
          localOperations.length,
          localOperations
        );

        if (!cancelled) {
          setSyncState({
            type: "loading",
            message:
              `Conectando ao Supabase. ` +
              `${localOperations.length} operação(ões) local(is) encontrada(s)...`,
          });
        }

        const {
          data: remoteRows,
          error: readError,
        } = await supabase
          .from("operations")
          .select("id");

        if (readError) {
          throw readError;
        }

        const remoteIds = new Set(
          (remoteRows ?? []).map((row) =>
            String(row.id)
          )
        );

        const invalidOperations =
          localOperations.filter(
            (operation) =>
              operation.id === undefined ||
              operation.id === null ||
              String(operation.id).trim() === ""
          );

        if (invalidOperations.length > 0) {
          throw new Error(
            `${invalidOperations.length} operação(ões) local(is) não possuem id.`
          );
        }

        const operationsToUpload =
          localOperations.filter(
            (operation) =>
              !remoteIds.has(
                String(operation.id)
              )
          );

        console.log(
          "[SUPABASE DIAGNÓSTICO] Operações que serão enviadas:",
          operationsToUpload.length,
          operationsToUpload
        );

        if (operationsToUpload.length > 0) {
          const {
            data: insertedRows,
            error: writeError,
          } = await supabase
            .from("operations")
            .upsert(
              operationsToUpload.map(
                (operation) => {
                  const normalizedOperation = {
                    ...operation,
                    id: String(operation.id),
                  };

                  return {
                    id: String(operation.id),
                    payload:
                      normalizedOperation,
                  };
                }
              ),
              {
                onConflict: "id",
              }
            )
            .select("id");

          if (writeError) {
            throw writeError;
          }

          console.log(
            "[SUPABASE DIAGNÓSTICO] Linhas gravadas:",
            insertedRows
          );
        }

        const {
          count,
          error: countError,
        } = await supabase
          .from("operations")
          .select("id", {
            count: "exact",
            head: true,
          });

        if (countError) {
          throw countError;
        }

        const message =
          `Supabase conectado. ` +
          `${localOperations.length} operação(ões) local(is), ` +
          `${operationsToUpload.length} enviada(s), ` +
          `${count ?? 0} linha(s) na tabela.`;

        console.log(
          "[SUPABASE DIAGNÓSTICO]",
          message
        );

        if (!cancelled) {
          setSyncState({
            type: "success",
            message,
          });
        }
      } catch (error) {
        const message =
          formatSupabaseError(error);

        console.error(
          "[SUPABASE DIAGNÓSTICO] Falha:",
          error
        );

        if (!cancelled) {
          setSyncState({
            type: "error",
            message,
          });
        }
      }
    }

    void migrateLocalOperations();

    return () => {
      cancelled = true;
    };
  }, []);

  const background =
    syncState.type === "success"
      ? "#14532d"
      : syncState.type === "error"
        ? "#7f1d1d"
        : "#1e3a8a";

  return (
    <BrowserRouter>
      <div
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 99999,
          maxWidth: 520,
          padding: "12px 16px",
          borderRadius: 10,
          background,
          color: "#ffffff",
          fontFamily:
            "Arial, sans-serif",
          fontSize: 14,
          lineHeight: 1.4,
          boxShadow:
            "0 10px 30px rgba(0,0,0,0.35)",
        }}
      >
        <strong>
          Diagnóstico Supabase
        </strong>

        <div style={{ marginTop: 6 }}>
          {syncState.message}
        </div>
      </div>

      <Routes>
        <Route
          path="/"
          element={<DashboardPage />}
        />

        <Route
          path="/portfolio"
          element={<OperationsPage />}
        />

        <Route
          path="/new-operation"
          element={<NewOperationPage />}
        />

        <Route
          path="/edit-operation/:id"
          element={<NewOperationPage />}
        />

        <Route
          path="/calculator"
          element={<CalculatorPage />}
        />

        <Route
          path="/simulator"
          element={<div>Simulador</div>}
        />

        <Route
          path="/settings"
          element={<SettingsPage />}
        />

        <Route
          path="/ativo"
          element={<AssetAnalysisPage />}
        />

        <Route
          path="*"
          element={
            <Navigate
              to="/"
              replace
            />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
