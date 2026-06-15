import { useEffect } from "react";

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

import { useOperationsStore } from "./store/useOperationsStore";

function App() {
  const initializeOperations =
    useOperationsStore(
      (state) =>
        state.initialize
    );

  useEffect(() => {
    void initializeOperations();
  }, [initializeOperations]);

  return (
    <BrowserRouter>
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
          element={
            <div>Simulador</div>
          }
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
