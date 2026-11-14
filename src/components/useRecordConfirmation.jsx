import { useCallback, useEffect, useRef, useState } from 'react';
import ConfirmRecordAction from './ConfirmRecordAction.jsx';

export default function useRecordConfirmation() {
  const [request, setRequest] = useState(null);
  const pending = useRef(null);
  useEffect(() => () => pending.current?.(false), []);
  const settle = useCallback(value => { const resolve = pending.current; pending.current = null; setRequest(null); resolve?.(value); }, []);
  const confirm = useCallback(options => new Promise(resolve => { pending.current?.(false); pending.current = resolve; setRequest(options); }), []);
  return { confirm, confirmation: <ConfirmRecordAction open={Boolean(request)} {...request} onCancel={() => settle(false)} onConfirm={() => settle(true)} /> };
}
