import { useSyncExternalStore } from "react";
import { APP_VERSION } from "../../appUpdate.js";
import "./workspace-support-details.css";

const STAGES = Object.freeze({
  READ_SESSION: "Read saved sign-in",
  VERIFY_ACCOUNT: "Verify account",
  VERIFY_SESSION: "Verify active session",
});
const TIMEOUT_CODES = new Set(["ACCOUNT_TIMEOUT", "READ_SESSION_TIMEOUT", "VERIFY_ACCOUNT_TIMEOUT", "VERIFY_SESSION_TIMEOUT"]);

function buildDetails() {
  const version = typeof APP_VERSION === "string" ? APP_VERSION : "";
  const revision = version.match(/(?:^|-)([a-f0-9]{40})(?:-|$)/i)?.[1];
  const deployment = version.match(/^dpl_?([a-z0-9]+)/i)?.[1];
  const timestamp = version.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z/)?.[0];
  const date = timestamp ? new Date(timestamp) : null;
  return {
    label: revision ? revision.slice(0, 8) : deployment ? `Deployment ${deployment.slice(0, 8)}` : version === "dev" ? "Development" : "Local build",
    builtAt: date && Number.isFinite(date.getTime()) ? `${date.toISOString().slice(0, 16).replace("T", " ")} UTC` : null,
  };
}
function networkHint() {
  if (globalThis.navigator?.onLine === true) return "Browser reports online";
  if (globalThis.navigator?.onLine === false) return "Browser reports offline";
  return "Browser status unavailable";
}
function subscribeNetworkHint(onChange) {
  globalThis.addEventListener?.("online", onChange);
  globalThis.addEventListener?.("offline", onChange);
  return () => {
    globalThis.removeEventListener?.("online", onChange);
    globalThis.removeEventListener?.("offline", onChange);
  };
}

/** Public build metadata and fixed diagnostic labels only; no account payloads. */
export default function WorkspaceSupportDetails({ stage, code }) {
  const network = useSyncExternalStore(subscribeNetworkHint, networkHint, () => "Browser status unavailable");
  const build = buildDetails();
  const stageLabel = typeof stage === "string" && Object.hasOwn(STAGES, stage) ? STAGES[stage] : "Not available";
  const errorCode = TIMEOUT_CODES.has(code) ? code : "Not available";
  return <details className="workspace-support-details">
    <summary>Support details</summary>
    <dl>
      <div><dt>Loaded build</dt><dd><code>{build.label}</code>{build.builtAt && <span className="workspace-support-details__built">{build.builtAt}</span>}</dd></div>
      <div><dt>Account step</dt><dd>{stageLabel}</dd></div>
      <div><dt>Error code</dt><dd><code>{errorCode}</code></dd></div>
      <div><dt>Browser status</dt><dd>{network}</dd></div>
    </dl>
    <p>Browser status does not confirm access to the account service.</p>
  </details>;
}
