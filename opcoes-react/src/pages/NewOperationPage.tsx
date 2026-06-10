import { useEffect } from "react";
import { useParams } from "react-router-dom";

import Layout from "../components/Layout/Layout";
import NewOperationForm from "../components/NewOperation/NewOperationForm";
import NewOperationPreview from "../components/NewOperation/NewOperationPreview";

import { useOperationsStore } from "../store/useOperationsStore";
import { useOperationDraftStore } from "../store/useOperationDraftStore";
import { useMarketDataStore } from "../store/useMarketDataStore";

export default function NewOperationPage() {
  const { id } = useParams();

  const getOperationById = useOperationsStore((state) => state.getOperationById);
  const loadFromOperation = useOperationDraftStore(
    (state) => state.loadFromOperation
  );
  const clear = useOperationDraftStore((state) => state.clear);
  const prices = useMarketDataStore((state) => state.prices);

  const isEditing = Boolean(id);

  useEffect(() => {
    if (!id) {
      clear();
      return;
    }

    const operation = getOperationById(id);

    if (!operation) return;

    loadFromOperation(operation, prices[operation.symbol] ?? 100);
  }, [id, getOperationById, loadFromOperation, clear, prices]);

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