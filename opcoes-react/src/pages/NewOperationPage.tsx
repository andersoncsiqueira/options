import Layout from "../components/Layout/Layout";
import NewOperationForm from "../components/NewOperation/NewOperationForm";
import NewOperationPreview from "../components/NewOperation/NewOperationPreview";

export default function NewOperationPage() {
  return (
    <Layout>
      <div className="page-header">
        <h2>➕ Nova Operação</h2>
        <p>Monte estratégias manualmente ou use modelos prontos.</p>
      </div>

      <div className="new-operation-layout">
        <NewOperationForm />
        <NewOperationPreview />
      </div>
    </Layout>
  );
}