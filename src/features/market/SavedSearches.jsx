// Chip row under the Market search form (COULD 35).
import { useState } from "react";
import { addSavedSearch, isSavedSearch, readSavedSearches, removeSavedSearch, touchSavedSearch, writeSavedSearches } from "./savedSearches.js";
import "./saved-searches.css";

export default function SavedSearches({ currentQuery = "", hasRun = false, onRun = () => {} }) {
  const [rows, setRows] = useState(() => readSavedSearches());
  const commit = (next) => { setRows(writeSavedSearches(next)); };
  const clean = String(currentQuery || "").trim();
  const saved = clean ? isSavedSearch(rows, clean) : false;
  if (!rows.length && !(hasRun && clean)) return null;
  return (
    <div className="saved-searches" aria-label="Saved searches">
      <div className="saved-searches__head">
        <span className="home-group-label">Saved searches</span>
        {hasRun && clean ? (
          <button type="button" className="saved-searches__toggle" aria-pressed={saved} onClick={() => commit(saved ? removeSavedSearch(rows, clean) : addSavedSearch(rows, clean))}>
            {saved ? "★ Saved" : "☆ Save this search"}
          </button>
        ) : null}
      </div>
      {rows.length ? (
        <ul className="saved-searches__list">
          {rows.map((row) => (
            <li key={row.query}>
              <button type="button" className="saved-searches__chip" onClick={() => { commit(touchSavedSearch(rows, row.query)); onRun(row.query); }} title={`Run “${row.query}”`}>{row.label || row.query}</button>
              <button type="button" className="saved-searches__remove" aria-label={`Remove saved search ${row.query}`} onClick={() => commit(removeSavedSearch(rows, row.query))}>×</button>
            </li>
          ))}
        </ul>
      ) : <small className="saved-searches__hint">Save a search to run it again with one tap.</small>}
    </div>
  );
}
