import { useRef, useState } from "react";
const OPTIONS = [{ key: "scoutSignals", label: "Your restock watch" }, { key: "vaultSnapshot", label: "Your collection" }, { key: "marketWatch", label: "Prices & wants" }, { key: "forgeSummary", label: "Inventory & sales", business: true }, { key: "todayActivity", label: "Recently saved" }];
export default function HomeShortcutEditor({ visibleKeys, business = false, onApply, onCancel }) {
  const choices = OPTIONS.filter(option => !option.business || business);
  const [selected, setSelected] = useState(() => visibleKeys || choices.map(option => option.key));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  async function save() {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      if (typeof onApply !== "function" || await onApply(selected) === false) {
        setError("These preferences could not be saved. Your choices are still here; try again.");
        return;
      }
      onCancel();
    } catch {
      setError("These preferences could not be saved. Your choices are still here; try again.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  return <section className="home-shortcut-editor" aria-label="Customize Home" aria-busy={saving}>
    <h3>Your Home shortcuts</h3><p>Show only what you use.</p>
    <div className="home-shortcut-options">{choices.map(option => <label key={option.key}><input type="checkbox" disabled={saving} checked={selected.includes(option.key)} onChange={event => setSelected(keys => event.target.checked ? [...keys, option.key] : keys.filter(key => key !== option.key))} />{option.label}</label>)}</div>
    <details className="home-shortcut-preview"><summary>Preview your choices</summary>{choices.filter(option => selected.includes(option.key)).length ? <ol>{choices.filter(option => selected.includes(option.key)).map(option => <li key={option.key}>{option.label}</li>)}</ol> : <p>Only the restock actions will appear.</p>}</details>
    <div className="home-business-links"><button type="button" className="ops-button ops-button--primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save changes"}</button><button type="button" className="ops-button ops-button--secondary" disabled={saving} onClick={onCancel}>Cancel</button></div>
    {saving && <p role="status">Saving your layout…</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
