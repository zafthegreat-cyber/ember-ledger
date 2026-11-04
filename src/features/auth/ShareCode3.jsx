import { useId, useRef, useState } from "react";
import { PUBLIC_APP_INVITE_URL, sharePublicApp } from "./publicInvite.mjs";
import "./share-code3.css";

export default function ShareCode3() {
  const [state, setState] = useState("");
  const pending = useRef(false);
  const id = useId();
  async function invite() {
    if (pending.current) return;
    pending.current = true;
    setState("pending");
    try { setState(await sharePublicApp()); }
    finally { pending.current = false; }
  }
  return <div className="share-code3">
    <button type="button" className="secondary-button" disabled={state === "pending"} onClick={invite}>{state === "pending" ? "Opening invite…" : "Invite a collector"}</button>
    <p role="status" className="share-code3-status">{state === "shared" ? "Invite shared." : state === "copied" ? "App link copied. Send it to a collector you know." : state === "manual" ? "Select and copy the app link below." : state === "cancelled" ? "Sharing cancelled." : ""}</p>
    {state === "manual" ? <div className="share-code3-fallback"><label htmlFor={id}>Public app invite</label><input id={id} type="url" readOnly value={PUBLIC_APP_INVITE_URL} onFocus={event => event.target.select()} /></div> : null}
  </div>;
}
