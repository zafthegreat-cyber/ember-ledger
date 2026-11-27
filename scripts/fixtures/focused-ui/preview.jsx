import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import OperationsHome from "../../../src/pages/OperationsHome.jsx";
import WorkspaceHomePage from "../../../src/features/workspaces/WorkspaceHomePage.jsx";
import DealsScreen from "../../../src/features/flipScout/screens/DealsScreen.jsx";
import AuctionsScreen from "../../../src/features/flipScout/screens/AuctionsScreen.jsx";
import RestocksScreen from "../../../src/features/flipScout/screens/RestocksScreen.jsx";
import { resolveExperiencePresentation } from "../../../src/utils/experiencePresentation.js";
import "../../../src/features/flipScout/flipScout.css";
import "../../../src/App.css";
import "./preview.css";

const presentation = resolveExperiencePresentation();
const tabs = ["Home", "Find", "Saved listings", "Auctions", "Restocks"];
function Preview() {
  const [page, setPage] = useState("Home");
  const [theme, setTheme] = useState("dark");
  const [message, setMessage] = useState("");
  const [deals, setDeals] = useState([]);
  const [auctions, setAuctions] = useState([]);
  const navigate = path => setPage(path.includes("auctions") ? "Auctions" : path.includes("restocks") ? "Restocks" : "Saved listings");
  const showAction = label => setMessage(label + " selected. This preview does not connect to your account.");
  const save = async (type, record) => {
    const saved = { ...record, id: record.id || "preview-" + Date.now(), updatedAt: new Date().toISOString() };
    (type === "deals" ? setDeals : setAuctions)(rows => [saved, ...rows.filter(row => row.id !== saved.id)]);
    return saved;
  };
  return <div className="app app-command-shell focused-preview" data-theme={theme}>
    <header className="preview-toolbar"><strong>CODE 3 TCG <small>Unpublished preview</small></strong><button onClick={() => setTheme(value => value === "dark" ? "light" : "dark")}>{theme === "dark" ? "Light" : "Dark"} theme</button></header>
    <nav className="preview-tabs" aria-label="Preview screens">{tabs.map(tab => <button key={tab} aria-current={page === tab ? "page" : undefined} onClick={() => { setPage(tab); setMessage(""); }}>{tab}</button>)}</nav>
    <main className="preview-main">
      {message && <p role="status">{message}</p>}
      {page === "Home" && <OperationsHome setActiveTab={tab => showAction(tab)} onReportRestock={() => showAction("Report a restock")} onOpenRestockReports={() => setPage("Restocks")} onOpenBusiness={() => showAction("Inventory")} onOpenFind={() => setPage("Saved listings")} experiencePresentation={presentation} />}
      {page === "Find" && <WorkspaceHomePage workspace="FIND" onNavigate={navigate} experiencePresentation={presentation} />}
      {page === "Saved listings" && <DealsScreen deals={deals} experiencePresentation={presentation} onSave={save} onDelete={async (_,id) => {setDeals(rows => rows.filter(row => row.id !== id)); return true;}} onAnalyze={() => showAction("Compare costs")} />}
      {page === "Auctions" && <><AuctionsScreen auctions={auctions} onSave={save} onDelete={async (_,id) => {setAuctions(rows => rows.filter(row => row.id !== id));return true;}} /><details className="preview-test-tools"><summary>Preview test tools</summary><button onClick={() => setAuctions([{id:"sample-auction",title:"Example saved auction note",source:"Manual note",currentBid:"25",watchStatus:"Watching",notes:"Saved before live auctions. Preview only."}])}>Show an existing saved record</button></details></>}
      {page === "Restocks" && <RestocksScreen onReportRestock={() => showAction("Report a restock")} onOpenRestocks={() => showAction("Browse reports")} />}
    </main>
    <footer className="preview-footer">Preview only · Sample saves stay in memory · No account or price changes</footer>
  </div>;
}
createRoot(document.getElementById("root")).render(<Preview />);
