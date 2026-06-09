import { NavLink } from "react-router-dom";

export default function Sidebar() {

    return (

        <aside className="sidebar">

            <NavLink to="/">
                Dashboard
            </NavLink>

            <NavLink to="/operations">
                Operações
            </NavLink>

            <NavLink to="/calculator">
                Calculadora
            </NavLink>

            <NavLink to="/settings">
                Configurações
            </NavLink>

        </aside>

    );

}