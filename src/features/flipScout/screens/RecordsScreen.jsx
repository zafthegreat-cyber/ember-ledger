import { useEffect, useState } from "react";
import PurchasesInventoryScreen from "./records/PurchasesInventoryScreen.jsx";
import SalesScreen from "./records/SalesScreen.jsx";
import ExpensesMileageScreen from "./records/ExpensesMileageScreen.jsx";
import ResultsScreen from "./records/ResultsScreen.jsx";

const TABS = [
  ["purchases", "Purchases & Lots"],
  ["inventory", "Inventory"],
  ["sales", "Sales"],
  ["expenses", "Expenses"],
  ["mileage", "Mileage"],
  ["results", "Actual vs Projected"],
];

export default function RecordsScreen({ state, initialSubview = "", onSave, onDelete, onAllocateLot }) {
  const [view, setView] = useState(initialSubview || "purchases");
  useEffect(() => { if (initialSubview && TABS.some(([key]) => key === initialSubview)) setView(initialSubview); }, [initialSubview]);
  return <div className="flip-screen">
    <nav className="flip-subnav" aria-label="Business records">{TABS.map(([key, label]) => <button type="button" key={key} className={view === key ? "active" : ""} aria-current={view === key ? "page" : undefined} onClick={() => setView(key)}>{label}</button>)}</nav>
    {view === "purchases" || view === "inventory" ? <PurchasesInventoryScreen view={view} state={state} onSave={onSave} onDelete={onDelete} onAllocateLot={onAllocateLot} /> : null}
    {view === "sales" ? <SalesScreen state={state} onSave={onSave} onDelete={onDelete} /> : null}
    {view === "expenses" || view === "mileage" ? <ExpensesMileageScreen view={view} state={state} onSave={onSave} onDelete={onDelete} /> : null}
    {view === "results" ? <ResultsScreen state={state} /> : null}
  </div>;
}
