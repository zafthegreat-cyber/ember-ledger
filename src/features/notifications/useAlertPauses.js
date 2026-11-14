import { useEffect, useState } from 'react';
import { alertSource, normalizeAlertPauses } from '../../utils/notificationBrowse.mjs';

const keyFor = scope => `code3.alert-pauses.v1:${encodeURIComponent(scope)}`;
function read(scope) { try { return normalizeAlertPauses(JSON.parse(localStorage.getItem(keyFor(scope)) || '[]')); } catch { return []; } }
export default function useAlertPauses(scope) {
  const [state, setState] = useState(() => ({scope, rows:read(scope)}));
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const refresh = () => {setState({scope,rows:read(scope)});setNow(Date.now());};
    refresh();
    const timer = setInterval(() => setNow(Date.now()), 30000);
    const storage = event => {if (event.key === keyFor(scope)) refresh();};
    window.addEventListener('storage', storage);
    return () => {clearInterval(timer);window.removeEventListener('storage', storage);};
  }, [scope]);
  const rows = state.scope === scope ? state.rows : [];
  function save(next) {localStorage.setItem(keyFor(scope),JSON.stringify(next));setState({scope,rows:next});setNow(Date.now());}
  function pause(entry, hours) {
    const source=alertSource(entry);
    if (!source || ![1,3,24].includes(hours)) throw new Error('Choose a supported source and pause duration.');
    const startedAt=Date.now();
    const previous=read(scope).filter(p => p.until > startedAt - 24 * 3600000);
    save([...previous.filter(p => p.key !== source.key || p.until <= startedAt), {key:source.key,label:entry.title,startedAt,until:startedAt+hours*3600000}].slice(-100));
  }
  function resume(key) {
    const endedAt=Date.now();
    // Keep the completed interval so its old alerts do not buzz on resume.
    save(read(scope).map(p => p.key === key && p.until > endedAt ? {...p,until:Math.max(p.startedAt+1,endedAt)} : p));
  }
  return {rows,now,pause,resume};
}
