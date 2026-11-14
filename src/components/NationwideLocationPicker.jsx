import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { resolveArea, searchAreas } from '../utils/nationwideLocation.mjs';
import { loadAreaIndex, useNearbyPreference } from '../utils/nearbyPreference.mjs';
import './nationwide-location-picker.css';

export default function NationwideLocationPicker({ selection, onChange, allowModes = true, allowRadius = true, label = 'City or ZIP', onAreaSelected }) {
  const [saved, save] = useNearbyPreference();
  const value = selection || saved;
  const change = onChange || save;
  const id = useId(), input = useRef(null);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(null);
  const [lookupState, setLookupState] = useState('idle');
  const [open, setOpen] = useState(false), [active, setActive] = useState(0);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    loadAreaIndex().then(data => { if (alive) { setIndex(data); setLookupState('ready'); } }).catch(() => { if (alive) setLookupState('error'); });
    return () => { alive = false; };
  }, [open]);
  useEffect(() => {
    const params = new URLSearchParams(globalThis.location?.search || '');
    const near = params.get('near');
    if (!near || !/^(?:us-\d{7}|zip-\d{5})$/.test(near)) return;
    let alive = true;
    loadAreaIndex().then(data => {
      const area = resolveArea(data, near);
      if (alive && area) {
        change({ mode: 'nearby', area, radius: 25 }); onAreaSelected?.(area);
        const url=new URL(globalThis.location.href);url.searchParams.delete('near');globalThis.history?.replaceState(globalThis.history.state,'',`${url.pathname}${url.search}${url.hash}`);
      }
    }).catch(() => {});
    return () => { alive = false; };
    // Deep links are applied once; changing filters must not reapply a URL choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const choices = useMemo(() => index ? searchAreas(index, query) : [], [index, query]);
  function choose(area) {
    change({ ...value, mode: 'nearby', area, radius: value.radius || 25 });
    onAreaSelected?.(area);
    setQuery(''); setOpen(false); setActive(0);
    input.current?.focus();
  }
  function keyboard(event) {
    if (event.key === 'Escape') { setOpen(false); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setOpen(true);
      setActive(n => choices.length ? (n + (event.key === 'ArrowDown' ? 1 : choices.length - 1)) % choices.length : 0);
    }
    if (event.key === 'Enter') { event.preventDefault(); if (open && choices[active]) choose(choices[active]); }
  }
  return <div className="nationwide-location">
    {allowModes ? <div className="nationwide-location__modes" role="group" aria-label="Where to browse">
      <button type="button" aria-pressed={value.mode === 'all'} onClick={() => { change({ ...value, mode: 'all' }); setOpen(false); }}>Nationwide</button>
      <button type="button" aria-pressed={value.mode === 'nearby'} onClick={() => { change({ ...value, mode: 'nearby' }); setOpen(true); input.current?.focus(); }}>Nearby</button>
      <button type="button" aria-pressed={value.mode === 'online'} onClick={() => { change({ ...value, mode: 'online' }); setOpen(false); }}>Online</button>
    </div> : null}
    <label htmlFor={`${id}-query`}>{label}</label>
    <div className="nationwide-location__search">
      <input ref={input} id={`${id}-query`} role="combobox" aria-autocomplete="list" aria-expanded={open && choices.length > 0} aria-controls={open && choices.length ? `${id}-results` : undefined} aria-activedescendant={open && choices[active] ? `${id}-result-${active}` : undefined} autoComplete="off" type="search" inputMode="search" placeholder={value.area?.label || 'Enter a city or ZIP'} value={query} onFocus={() => setOpen(true)} onKeyDown={keyboard} onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0); }} />
      {query ? <button type="button" aria-label="Clear location search" onClick={() => { setQuery(''); input.current?.focus(); }}>×</button> : null}
    </div>
    {open && choices.length ? <ul id={`${id}-results`} role="listbox" aria-label="Matching places">{choices.map((area, n) => <li key={area.id} role="option" id={`${id}-result-${n}`} aria-selected={active === n}><button type="button" onClick={() => choose(area)}>{area.label}</button></li>)}</ul> : null}
    {open && query.length >= 2 && lookupState !== 'ready' ? <p role="status">{lookupState === 'error' ? 'Place search could not load. Your current selection is unchanged. Try again by reopening this search.' : 'Loading places…'}</p> : null}
    {open && index && query.length >= 2 && !choices.length ? <p role="status">No matching place. Try a city with its state, such as Austin TX. Some postal-only ZIPs have no mapped area.</p> : null}
    <div className="nationwide-location__summary" role="status">{value.mode === 'online' ? 'Online releases and restocks' : value.mode === 'nearby' ? value.area ? `Near ${value.area.label}` : 'Enter a city or ZIP to find nearby reports.' : 'Browsing nationwide'}{value.mode !== 'nearby' && value.area ? ` · Nearby saved: ${value.area.label}` : ''}</div>
    {allowModes && value.area ? <small>Area remembered on this device. Change it anytime.</small> : null}
    {allowRadius && value.mode === 'nearby' && value.area ? <details><summary>Within {value.radius || 25} miles · Change</summary><div className="nationwide-location__modes" role="group" aria-label="Nearby distance">{[5, 10, 25, 50, 100].map(radius => <button key={radius} type="button" aria-pressed={value.radius === radius} onClick={() => change({ ...value, radius })}>{radius} miles</button>)}</div><small>Uses public area centers. Reports without coordinates match the selected city and state only.</small></details> : null}
  </div>;
}
