import { useState } from "react";
const OPTIONS = [{ key: "scoutSignals", label: "Your restock watch" }, { key: "vaultSnapshot", label: "Your collection" }, { key: "marketWatch", label: "Prices & wants" }, { key: "forgeSummary", label: "Inventory & sales", business: true }, { key: "todayActivity", label: "Recently saved" }];
export default function HomeShortcutEditor({ visibleKeys, business = false, onApply, onCancel }) {
  const choices = OPTIONS.filter(option => !option.business || business);
  const [selected, setSelected] = useState(() => visibleKeys || choices.map(option => option.key));
  const [error, setError] = useState("");
  return <section className="home-shortcut-editor" aria-label="Customize Home">
    <h3>Choose what appears on Home</h3><p>Preview your choices below. Changes apply when you save.</p>
    <div className="home-shortcut-options">{choices.map(option => <label key={option.key}><input type="checkbox" checked={selected.includes(option.key)} onChange={event => setSelected(keys => event.target.checked ? [...keys, option.key] : keys.filter(key => key !== option.key))} />{option.label}</label>)}</div>
    <div className="home-shortcut-preview" aria-label="Home shortcut preview"><strong>Your Home preview</strong>{choices.filter(option => selected.includes(option.key)).length ? <ol>{choices.filter(option => selected.includes(option.key)).map(option => <li key={option.key}>{option.label}</li>)}</ol> : <p>Only the restock actions will appear.</p>}</div>
    <div className="home-business-links"><button type="button" className="ops-button ops-button--primary" onClick={() => { try { const result = onApply?.(selected); if (result === false) setError("These preferences could not be saved. Your previous layout is still active."); else onCancel(); } catch { setError("These preferences could not be saved. Try again."); } }}>Save changes</button><button type="button" className="ops-button ops-button--secondary" onClick={onCancel}>Cancel</button></div>
    {error && <p role="alert">{error}</p>}
  </section>;
}
