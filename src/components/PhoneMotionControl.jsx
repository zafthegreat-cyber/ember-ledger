import { useEffect, useState } from "react";
import { getCatalogMotionState, subscribeCatalogMotionState, requestCatalogMotionPermission, setCatalogMotionEnabled, recalibrateCatalogMotion } from "../utils/catalogMotion.mjs";
import "./phone-motion-control.css";

const defaultMotion = { getState: getCatalogMotionState, subscribeState: subscribeCatalogMotionState, requestPermission: requestCatalogMotionPermission, setEnabled: setCatalogMotionEnabled, recalibrate: recalibrateCatalogMotion };

// The optional controller is for isolated previews/tests; normal app callers use
// the one shared controller. No sensor samples are persisted or sent anywhere.
export default function PhoneMotionControl({ className = "", compact = false, showUnavailable = false, controller = defaultMotion }) {
  const [state, setState] = useState(() => controller.getState());
  useEffect(() => controller.subscribeState(setState), [controller]);
  if (state.status === "unsupported") return showUnavailable ? <p className={`phone-motion-control__note ${className}`}>Phone tilt is not available on this device. You can still drag to turn the item.</p> : null;
  if (state.status === "reduced-motion") return showUnavailable ? <p className={`phone-motion-control__note ${className}`}>Phone tilt is off because reduced motion is enabled on this device.</p> : null;
  const isOn = state.enabled, asking = state.status === "requesting";
  const label = asking ? "Allowing phone tilt…" : isOn ? "Phone tilt on" : state.status === "denied" ? "Try phone tilt again" : "Use phone tilt";
  const message = state.status === "denied" ? "Motion access was not allowed. You can keep using the touch controls."
    : state.status === "paused" ? "Phone tilt pauses while the app is in the background."
    : state.status === "ready" ? "Hold your phone comfortably, then tilt it gently."
    : state.status === "active" ? "Tilt your phone gently to move the item."
    : state.status === "off" ? "Phone tilt is off. Touch controls still work."
    : "Your phone may ask for motion access.";
  return <div className={`phone-motion-control ${className}`} data-compact={compact}>
    <div className="phone-motion-control__actions">
      <button type="button" className="phone-motion-control__button" aria-pressed={isOn} disabled={asking} onClick={() => isOn ? controller.setEnabled(false) : controller.requestPermission()}>{label}</button>
      {isOn && !compact ? <button type="button" className="phone-motion-control__button" onClick={() => controller.recalibrate()}>Center tilt</button> : null}
    </div>
    {!compact || state.status === "denied" ? <p className="phone-motion-control__note" role={state.status === "denied" ? "status" : undefined}>{message}</p> : null}
  </div>;
}
