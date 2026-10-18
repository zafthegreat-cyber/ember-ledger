import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient.js";
import { startNativeLifecycle } from "./nativeLifecycle.js";

export default function NativeBridge() {
  const [error, setError] = useState("");
  useEffect(() => {
    let stop;
    let active = true;
    const controller = new AbortController();
    startNativeLifecycle({ client: supabase, signal: controller.signal, onAuthError: message => { if (active) setError(message); } })
      .then(cleanup => { if (active) stop = cleanup; else cleanup(); })
      .catch(() => { if (active) setError("The device connection could not start. Close and reopen Code 3 TCG. Your saved records are unchanged."); });
    return () => { active = false; controller.abort(); stop?.(); };
  }, []);
  if (!error) return null;
  return <aside className="native-account-notice" role="alert"><p>{error}</p><button type="button" onClick={() => setError("")}>Dismiss</button></aside>;
}
