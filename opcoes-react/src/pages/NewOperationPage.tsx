import { useEffect } from "react";
import { useParams } from "react-router-dom";

import Layout from "../components/Layout/Layout";
import NewOperationForm from "../components/NewOperation/NewOperationForm";
import NewOperationPreview from "../components/NewOperation/NewOperationPreview";

import { useOperationsStore } from "../store/useOperationsStore";
import { useOperationDraftStore } from "../store/useOperationDraftStore";

import { getQuote } from "../services/marketData/marketDataService";

export default function NewOperationPage() {
  const { id } = useParams();

  const getOperationById = useOperationsStore((state) => state.getOperationById);

  const loadFromOperation = useOperationDraftStore(
    (state) => state.loadFromOperation
  );

  const clear = useOperationDraftStore((state) => state.clear);

  const isEditing = Boolean(id);

  useEffect(() => {
    let cancelled = false;

    async function loadOperationForEditing() {
      if (!id) {
        clear();
        return;
      }

      const operation = getOperationById(id);

      if (!operation) return;

      const symbol = operation.symbol.trim().toUpperCase();

      try {
        const quote = await getQuote(symbol);

        if (cancelled) return;

        loadFromOperation(operation, quote?.price ?? 0);
      } catch (error) {
        console.error(`Erro ao buscar preço atual de ${symbol}:`, error);

        if (cancelled) return;

        loadFromOperation(operation, 0);
      }
    }

    loadOperationForEditing();

    return () => {
      cancelled = true;
    };
  }, [id, getOperationById, loadFromOperation, clear]);

  return (
    <Layout>
      <div className="page-header">
        <h2>{isEditing ? "✏️ Editar Operação" : "➕ Nova Operação"}</h2>

        <p>
          {isEditing
            ? "Altere os dados da operação e salve as mudanças."
            : "Monte estratégias manualmente ou use modelos prontos."}
        </p>
      </div>

      <div className="new-operation-layout">
        <NewOperationForm editingId={id} />
        <NewOperationPreview />
      </div>
    </Layout>
  );
}