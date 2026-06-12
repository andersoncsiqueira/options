import { NavLink } from "react-router-dom";

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <NavLink to="/">📈 Dashboard</NavLink>

      <NavLink to="/portfolio">💼 Carteira</NavLink>

      <NavLink to="/new-operation">➕ Nova Operação</NavLink>

      <NavLink to="/ativo">📈 Ativo</NavLink>

      <NavLink to="/calculator">🧮 Calculadora</NavLink>

    
    </aside>
  );
}