import { useSyncExternalStore } from 'react';
import {areaKey} from './nationwideLocation.mjs';

const KEY = 'code3:public-browse-area:v1';
const EMPTY = Object.freeze({ mode: 'all', area: null, radius: 25 });
let current;
const listeners = new Set();
export const loadAreaIndex = (() => {
  let promise;
  return () => promise ||= import('../data/usLocationIndex.json').then(module => module.default).catch(error => { promise = null; throw error; });
})();
export function validNearbyPreference(value) {
  if (!value || !['all', 'online', 'nearby'].includes(value.mode) || ![10, 25, 50, 100].includes(value.radius)) return EMPTY;
  const area = value.area;
  if (area && (!/^(?:us-\d{7}|zip-\d{5})$/.test(area.id) || !/^[A-Z]{2}$/.test(area.state) || typeof area.city !== 'string' || area.city.length > 100 || !Number.isFinite(area.lat) || !Number.isFinite(area.lng) || Math.abs(area.lat) > 90 || Math.abs(area.lng) > 180)) return EMPTY;
  return { mode: value.mode, area: area || null, radius: value.radius };
}
function snapshot() {
  if (!current) {
    try { current = validNearbyPreference(JSON.parse(globalThis.localStorage?.getItem(KEY) || 'null')); }
    catch { current = EMPTY; }
  }
  return current;
}
export function setNearbyPreference(value) {
  current = validNearbyPreference(value);
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(current)); } catch { /* Browsing still works without storage. */ }
  for (const notify of listeners) notify();
}
const subscribe = callback => { listeners.add(callback); return () => listeners.delete(callback); };
export function useNearbyPreference() {
  return [useSyncExternalStore(subscribe, snapshot, () => EMPTY), setNearbyPreference];
}
export function nearbyCoordinatesForText(text) {
  const area=snapshot().area,query=areaKey(text);
  if(!area||!query||![area.label,`${area.city}, ${area.state}`,area.zip].some(value=>areaKey(value)===query))return null;
  return {lat:area.lat,lng:area.lng};
}
