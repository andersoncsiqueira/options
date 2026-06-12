import { useEffect, useState } from "react";
import { checkApiHealth } from "../services/optionsMarketApi";

function SettingsPage() {
  const [apiStatus, setApiStatus] = useState("Testando conexão com a API...");

  useEffect(() => {
    async function testApi() {
      try {
        const response = await checkApiHealth();

        setApiStatus(
          `API online: ${response.name} - Atualizada em ${response.updatedAt}`
        );
      } catch (error) {
        console.error(error);
        setApiStatus("Erro ao conectar com a API");
      }
    }

    testApi();
  }, []);

  return (
    <div className="page">
      <h1>Configurações</h1>

      <div className="card">
        <h2>Status da API</h2>
        <p>{apiStatus}</p>
      </div>
    </div>
  );
}

export default SettingsPage;