import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import DashboardPage from "./pages/DashboardPage";
import OperationsPage from "./pages/OperationsPage";
import CalculatorPage from "./pages/CalculatorPage";
import SettingsPage from "./pages/SettingsPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />

        <Route path="/operations" element={<OperationsPage />} />

        <Route path="/calculator" element={<CalculatorPage />} />

        <Route path="/settings" element={<SettingsPage />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;