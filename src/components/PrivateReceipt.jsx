import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient.js";
import { classifyReceiptReference, createPrivateReceiptAccess } from "../services/privateReceiptAccess.js";
import "./private-receipt.css";

const resolveReceipt = createPrivateReceiptAccess({ client: supabase });
const ARTWORK_BUCKETS = new Set(["receipts"]);
const resolveArtwork = createPrivateReceiptAccess({ client: supabase, privateBuckets: ARTWORK_BUCKETS });

function useReceipt(reference, artwork = false) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const direct = classifyReceiptReference(reference, supabase?.supabaseUrl, artwork ? ARTWORK_BUCKETS : undefined);
  useEffect(() => {
    if (direct.kind === "direct") return undefined;
    const controller = new AbortController();
    let active = true;
    let refresh;
    const clear = () => {
      controller.abort();
      clearTimeout(refresh);
      if (active) { setResult(null); setAttempt((value) => value + 1); }
    };
    const subscription = supabase?.auth?.onAuthStateChange((event) => {
      if (event !== "INITIAL_SESSION") clear();
    })?.data?.subscription;
    (artwork ? resolveArtwork : resolveReceipt)(reference, { signal: controller.signal }).then((next) => {
      if (!active || controller.signal.aborted) return;
      setResult({ reference, attempt, ...next });
      if (next.private) refresh = setTimeout(clear, Math.max(1000, next.expiresAt - Date.now() - 15_000));
    }).catch((error) => {
      if (active && !controller.signal.aborted) setResult({ reference, attempt, error: error.message });
    });
    return () => { active = false; controller.abort(); clearTimeout(refresh); subscription?.unsubscribe(); };
  }, [reference, attempt, direct.kind, artwork]);
  return {
    ...(direct.kind === "direct" ? direct : result?.reference === reference && result?.attempt === attempt ? result : {}),
    retry: () => setAttempt((value) => value + 1),
  };
}

function ReceiptUnavailable({ state, label, interactive = true, className = "", style }) {
  return <span className={`private-receipt-status ${className}`.trim()} style={style}>
    <span role="status">{state.error || `Loading ${label.toLowerCase()}…`}</span>
    {state.error && interactive ? <button type="button" className="secondary-button" onClick={state.retry}>Retry receipt</button> : null}
  </span>;
}

export function PrivateReceiptImage({ src, alt = "Receipt", ...props }) {
  const state = useReceipt(src);
  return state.url
    ? <img {...props} src={state.url} alt={alt} referrerPolicy="no-referrer" />
    : <ReceiptUnavailable state={state} label="receipt preview" interactive={false} className={props.className} style={{ width: props.width, height: props.height, ...props.style }} />;
}

// Only the newly private legacy receipts bucket changes artwork access. Existing
// signed Scout/report images in other buckets keep their original behavior.
export function PrivateStorageImage({ src, alt = "", ...props }) {
  const reference = classifyReceiptReference(src, supabase?.supabaseUrl, ARTWORK_BUCKETS);
  if (reference.kind === "direct") return <img {...props} src={reference.url} alt={alt} />;
  return <AuthorizedArtwork src={src} alt={alt} {...props} />;
}

function AuthorizedArtwork({ src, alt, ...props }) {
  const state = useReceipt(src, true);
  return state.url
    ? <img {...props} src={state.url} alt={alt} referrerPolicy="no-referrer" />
    : <ReceiptUnavailable state={state} label="image preview" interactive={false} className={props.className} style={{ width: props.width, height: props.height, ...props.style }} />;
}

export function PrivateReceiptLink({ href, children = "View receipt", ...props }) {
  const state = useReceipt(href);
  return state.url
    ? <a {...props} href={state.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{children}</a>
    : <ReceiptUnavailable state={state} label="receipt link" />;
}
