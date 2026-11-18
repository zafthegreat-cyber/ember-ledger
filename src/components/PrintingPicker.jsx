import { useId, useMemo, useState } from "react";
import { combinePrinting, printingChoices, printingLabel, SPECIAL_PRINTINGS } from "../utils/cardPrintings.mjs";
import "./printing-picker.css";

// Printing picker for cards (Nov 17 2026): every printing this card comes in,
// as one-tap choices, plus special printings and stamps such as Trick or
// Treat. The saved value stays the existing free-text variant field, so older
// records and custom entries keep working.
export default function PrintingPicker({ value = "", catalogNames = [], onChange }) {
  const id = useId();
  const choices = useMemo(() => printingChoices(catalogNames), [catalogNames]);
  const current = printingLabel(value);
  const [special, setSpecial] = useState(() => SPECIAL_PRINTINGS.find((item) => String(value).toLowerCase().includes(item.label.replace(/ \(.*\)$/, "").toLowerCase()))?.key || "");
  const [finish, setFinish] = useState(() => choices.find((choice) => current.toLowerCase().startsWith(choice.label.toLowerCase()))?.label || current || "");
  const [custom, setCustom] = useState(false);
  const apply = (nextFinish, nextSpecial) => { setFinish(nextFinish); setSpecial(nextSpecial); onChange?.(combinePrinting(nextFinish, nextSpecial)); };
  return <fieldset className="printing-picker">
    <legend>Printing</legend>
    <p className="printing-picker__help">A photo cannot always tell foil from regular. Pick what your copy is{choices.some((c) => c.fromCatalog) ? "; this card's known printings come first" : ""}.</p>
    <div className="printing-picker__chips" role="radiogroup" aria-label="Finish">
      {choices.map((choice) => <button key={choice.label} type="button" role="radio" aria-checked={finish === choice.label} className={choice.fromCatalog ? "is-known" : ""} onClick={() => apply(choice.label, special)}>{choice.label}</button>)}
      <button type="button" role="radio" aria-checked={custom} onClick={() => setCustom(true)}>Other…</button>
    </div>
    <label className="printing-picker__special" htmlFor={`${id}-special`}>Special printing or stamp
      <select id={`${id}-special`} value={special} onChange={(event) => apply(finish, event.target.value)}>
        <option value="">None</option>
        {SPECIAL_PRINTINGS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
      </select>
    </label>
    {special ? <p className="printing-picker__help">{SPECIAL_PRINTINGS.find((item) => item.key === special)?.hint}</p> : null}
    {custom ? <label className="printing-picker__custom" htmlFor={`${id}-custom`}>Describe the printing
      <input id={`${id}-custom`} value={value} onChange={(event) => onChange?.(event.target.value)} placeholder="e.g. Galaxy holo, Staff stamp, Japanese promo" />
    </label> : null}
    <p className="printing-picker__saved" aria-live="polite">Saved as: <strong>{value || "Not chosen yet"}</strong></p>
  </fieldset>;
}
