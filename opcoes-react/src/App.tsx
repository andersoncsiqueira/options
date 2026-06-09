import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

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

        <Route path="*" element={<Navigate to="/" />} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;