// Public area centers only. The same module is deployed with the Discord bot.
export const areaKey = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function distanceMiles(a, b) {
  if (![a?.lat, a?.lng, b?.lat, b?.lng].every(Number.isFinite) || Math.abs(a.lat) > 90 || Math.abs(b.lat) > 90 || Math.abs(a.lng) > 180 || Math.abs(b.lng) > 180) return null;
  const rad = Math.PI / 180;
  const n = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return 7917.5226 * Math.asin(Math.sqrt(Math.min(1, n)));
}

const lookups = new WeakMap();
function lookup(index) {
  if (!lookups.has(index)) {
    const places = new Map(index.places.map(row => [row[0], row]));
    const zips = new Map(index.zips.map(row => [row[0], row]));
    const searchRows=index.places.map(row=>({row,name:areaKey(row[1]),search:areaKey(`${row[1]} ${row[2]} ${index.states?.[row[2]]||''}`)}));
    lookups.set(index, { places, zips, searchRows });
  }
  return lookups.get(index);
}

export function resolveArea(index, id) {
  const { places, zips } = lookup(index);
  let place, point, zip = '', approximate = false;
  if (/^us-\d{7}$/.test(id || '')) place = places.get(id.slice(3));
  if (/^zip-\d{5}$/.test(id || '')) {
    const row = zips.get(id.slice(4));
    if (row) { place = places.get(row[1]); point = { lat: row[2], lng: row[3] }; zip = row[0]; approximate = row[4] === true; }
  }
  if (!place) return null;
  return { id, placeId: `us-${place[0]}`, city: place[1], state: place[2], stateName: index.states?.[place[2]] || place[2], label: `${zip ? `${zip} · ${approximate ? 'near ' : ''}` : ''}${place[1]}, ${place[2]}`, lat: point?.lat ?? place[3], lng: point?.lng ?? place[4], zip, approximate };
}

export function searchAreas(index, query, limit = 8) {
  const text = String(query || '').trim().slice(0, 80);
  if (/^\d{5}(?:-\d{4})?$/.test(text)) {
    const result = resolveArea(index, `zip-${text.slice(0, 5)}`);
    return result ? [result] : [];
  }
  const key = areaKey(text);
  if (key.length < 2 || /^\d/.test(key)) return [];
  const stateHint=Object.entries(index.states||{}).flatMap(([code,name])=>[{code,name:areaKey(name)},{code,name:code.toLowerCase()}]).sort((a,b)=>b.name.length-a.name.length).find(s=>key.endsWith(` ${s.name}`)&&key.length>s.name.length+2);
  const cityKey=stateHint?key.slice(0,-stateHint.name.length-1):key,terms=cityKey.split(' ').filter(Boolean);
  return lookup(index).searchRows
    .filter(p=>!stateHint||p.row[2]===stateHint.code)
    .filter(p => terms.every(t => p.search.split(' ').some(word => word.startsWith(t))))
    .sort((a, b) => (a.name === cityKey ? -1 : b.name === cityKey ? 1 : a.name.startsWith(cityKey) !== b.name.startsWith(cityKey) ? (a.name.startsWith(cityKey) ? -1 : 1) : a.name.length - b.name.length) || a.search.localeCompare(b.search))
    .slice(0, Math.max(1, Math.min(25, limit))).map(p => resolveArea(index, `us-${p.row[0]}`));
}

export function matchesNearby(record, area, radius = 25) {
  if (!area) return true;
  if (record.kind === 'online' || record.online === true) return false;
  const lat = record.latitude ?? record.lat, lng = record.longitude ?? record.lng ?? record.lon;
  if (lat !== '' && lat != null && lng !== '' && lng != null) {
    const distance = distanceMiles(area, { lat: Number(lat), lng: Number(lng) });
    if (distance !== null) return distance <= radius;
  }
  const city = areaKey(record.city);
  const state = areaKey(record.stateCode || record.state_code || record.state);
  // No inferred distance for records without coordinates: exact public city/state only.
  return !!city && city === areaKey(area.city) && (state === areaKey(area.state) || state === areaKey(area.stateName));
}

export function locationScopeMatch(record, preference = {}) {
  if (preference.mode === 'online') return record.kind === 'online' || record.online === true;
  if (preference.mode !== 'nearby') return true;
  return !!preference.area && matchesNearby(record, preference.area, preference.radius || 25);
}
