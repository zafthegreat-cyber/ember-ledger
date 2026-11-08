import { US_STATES } from "../data/usStates.js";
import { normalizeStoreStateCode } from "../data/storeStates.js";
import NationwideLocationPicker from './NationwideLocationPicker.jsx';

export default function ManualStoreAreaFields({ value, onChange }) {
  return <div className="scout-manual-store-area">
    <NationwideLocationPicker allowModes={false} allowRadius={false} label="Store city or ZIP" selection={{mode:'nearby',area:null,radius:25}} onChange={({area})=>{if(area){onChange('city',area.city);onChange('state',area.state);onChange('zip',area.zip);}}} />
    {value.city ? <p role="status">Store area: {value.city}, {normalizeStoreStateCode(value.state) || value.state}</p> : null}
    <details><summary>Enter the store area manually</summary>
    <label><span>Store city</span>
      <input aria-label="Manual store city" value={value.city || ""} onChange={event => onChange("city", event.target.value)} placeholder="City" autoComplete="off" />
    </label>
    <label><span>Store state</span>
      <select aria-label="Manual store state" value={normalizeStoreStateCode(value.state)} onChange={event => onChange("state", event.target.value)}>
        <option value="">Choose a state</option>
        {US_STATES.map(state => <option key={state.code} value={state.code}>{state.shortName}</option>)}
      </select>
    </label>
    <p>Use the store’s location so collectors can find this report in the right area.</p>
    </details>
  </div>;
}
