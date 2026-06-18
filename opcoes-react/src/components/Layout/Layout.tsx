import type { ReactNode } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";

interface Props {
    children: ReactNode;
}

export default function Layout({ children }: Props) {

    return (

        <div className="app">

            <Sidebar />

            <div className="content">

                <Header />

                <main>

                    {children}

                </main>

            </div>

        </div>

    );

}