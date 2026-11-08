import { US_STATES } from "../data/usStates.js";
import { normalizeStoreStateCode } from "../data/storeStates.js";

export default function ManualStoreAreaFields({ value, onChange }) {
  return <div className="scout-manual-store-area">
    <label><span>Store city</span>
      <input aria-label="Manual store city" value={value.city || ""} onChange={event => onChange("city", event.target.value)} placeholder="City" autoComplete="off" required />
    </label>
    <label><span>Store state</span>
      <select aria-label="Manual store state" value={normalizeStoreStateCode(value.state)} onChange={event => onChange("state", event.target.value)} required>
        <option value="">Choose a state</option>
        {US_STATES.map(state => <option key={state.code} value={state.code}>{state.shortName}</option>)}
      </select>
    </label>
    <p>Use the store’s location so collectors can find this report in the right area.</p>
  </div>;
}
