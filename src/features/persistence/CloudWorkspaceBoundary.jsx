import { useCallback, useEffect, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../../supabaseClient.js";
import { isLocalDevelopmentIdentityEnabled } from "../../services/ownerSession.js";
import { CloudWorkspaceContext } from "./CloudWorkspaceContext.js";
import { createCloudWorkspaceSync } from "./cloudWorkspaceSync.js";
import { claimWorkspaceOwner, hasPendingWorkspaceOwnerSwitch, hasWorkspaceLocalRecords, readWorkspaceBinding, recoverWorkspaceOwnerSwitch, switchWorkspaceOwner } from "./workspaceOwnerBinding.js";
import { hasSessionDrafts, readSessionDraftBinding, hasPendingSessionDraftSwitch, recoverSessionDraftSwitch, switchSessionDraftOwner } from "./workspaceSessionBinding.js";
import { acquireWorkspaceReadLease, applyWorkspaceSources, hasPendingWorkspaceRecovery, recoverWorkspaceSources } from "../backup/workspaceRecovery.js";
import WorkspaceRestorePanel from "../backup/WorkspaceRestorePanel.jsx";
import { planWorkspaceRestore } from "../backup/workspaceRestorePlan.js";
import { exportLegacyCloudBackup, inspectLegacyCloudBackup, restoreLegacyCloudBackup } from "../backup/legacyCloudBackup.js";
import { confirmAccountOperation, consumeAccountConfirmation } from "../../services/accountSessionService.js";
import WorkspaceRecoverySignIn from "./WorkspaceRecoverySignIn.jsx";
import WorkspaceSupportDetails from "./WorkspaceSupportDetails.jsx";
import WorkspaceSyncNotice from "./WorkspaceSyncNotice.jsx";
import "../../styles/theme.css";
import "./cloud-workspace.css";

const preferenceKey = (id) => `code3.cloud-saving-enabled.v1:${id}`;
const localDevelopment = () => isLocalDevelopmentIdentityEnabled({ queryEnabled: new URLSearchParams(globalThis.location?.search || "").get("betaLocalMode") === "true" });
const storageFailure = (code = "") => ["DEVICE_SAVE_FAILED", "STORAGE_UNAVAILABLE", "STORAGE_WRITE_FAILED", "DRAFT_STORAGE_UNAVAILABLE", "LOCAL_TRACKING_FAILED", "RECOVERY_COPY_FAILED", "QuotaExceededError", "SecurityError"].includes(code) || String(code).startsWith("PAYLOAD_");
const syncError = (result) => Object.assign(new Error(result.message), { code: result.status });
const hasPendingWrites = () => hasPendingWorkspaceRecovery(localStorage) || hasPendingWorkspaceOwnerSwitch(localStorage) || hasPendingSessionDraftSwitch(sessionStorage);
function assertNoPendingWrites() {
  if (hasPendingWrites()) {
    throw Object.assign(new Error("An interrupted save still needs recovery. Keep this app’s stored data and retry safely before editing records."), { code: "RECOVERY_REQUIRED" });
  }
}
function bounded(request, stage, abort) {
  let timer;
  return Promise.race([request, new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(Object.assign(new Error("Account verification did not finish in time. Your saved records are unchanged. Retry safely to check again."), { stage, code: `${stage}_TIMEOUT` }));
      abort?.abort();
    }, 15000);
  })]).catch((error) => {
    // Keep the failing step available without exposing any session details.
    throw Object.assign(error instanceof Error ? error : new Error("Account verification could not finish."), { stage });
  }).finally(() => clearTimeout(timer));
}

function WorkspaceLease({ children, onError }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    let release;
    acquireWorkspaceReadLease().then((done) => {
      if (!active) { done(); return; }
      release = done;
      // Check again while holding the lease, after any competing tab's write.
      try { assertNoPendingWrites(); }
      catch (error) { done(); release = null; onError(error); return; }
      setReady(true);
    }).catch((error) => { if (active) onError(error); });
    return () => { active = false; release?.(); };
  }, [onError]);
  return ready ? children : <WorkspaceScreen title="Opening your saved records" />;
}

function WorkspaceScreen({ title, children }) {
  let theme = document.documentElement.dataset.bootTheme || "light";
  try { const saved = localStorage.getItem("et-tcg-app-theme"); if (["light", "dark"].includes(saved)) theme = saved; } catch { /* The account gate still reports storage failures. */ }
  return <main className="cloud-workspace-screen" data-theme={theme}><section className="cloud-workspace-card" aria-labelledby="workspace-heading">
    <span className="cloud-workspace-eyebrow">Code 3 TCG · Your data</span>
    <h1 id="workspace-heading" tabIndex={-1}>{title}</h1>{children}
  </section></main>;
}

/** No record writers mount until account attribution and interrupted writes are settled. */
export default function CloudWorkspaceBoundary({ children, client = supabase, configured = isSupabaseConfigured, development = localDevelopment() }) {
  const [screen, setScreen] = useState({ phase: development || !configured ? "passthrough" : "checking", user: null, message: "" });
  const [syncState, setSyncState] = useState({ status: "IDLE", message: "Cloud saving is preparing." });
  const [enabled, setEnabled] = useState(true);
  const generation = useRef(0);
  const controller = useRef(null);
  const unsubscribe = useRef(null);
  const identity = useRef(null);
  const [operation, setOperation] = useState(null);

  const stop = useCallback(() => {
    unsubscribe.current?.(); unsubscribe.current = null;
    controller.current?.close(); controller.current = null;
  }, []);
  const fail = useCallback((error) => setScreen((value) => ({ ...value, phase: "error", stage: error.stage, code: typeof error.code === "string" ? error.code : error.name || "", message: error.message || "Your records could not be opened safely. They have been preserved." })), []);

  const verify = useCallback(async (expectedId) => {
    const result = await bounded(client.auth.getUser(), "VERIFY_ACCOUNT");
    if (result.error || !result.data?.user || result.data.user.is_anonymous || (expectedId && result.data.user.id !== expectedId)) throw Object.assign(new Error("Sign in to the same account to open these records."), { stage: "VERIFY_ACCOUNT" });
    const abort = new AbortController();
    const request = client.rpc("code3_current_session_valid");
    const checked = await bounded(typeof request.abortSignal === "function" ? request.abortSignal(abort.signal) : request, "VERIFY_SESSION", abort);
    if (checked.error || checked.data !== true) throw Object.assign(new Error("Your account session could not be verified. Sign in again, or retry safely."), { stage: "VERIFY_SESSION" });
    return result.data.user;
  }, [client]);

  const open = useCallback(async (user, ticket) => {
    const assertCurrent = () => {
      if (ticket !== generation.current || identity.current !== user.id) throw new Error("The account changed. No new records were applied.");
    };
    if (hasPendingWorkspaceOwnerSwitch(localStorage)) await recoverWorkspaceOwnerSwitch({ storage: localStorage, assertCurrent });
    if (hasPendingSessionDraftSwitch(sessionStorage)) recoverSessionDraftSwitch({ storage: sessionStorage, assertCurrent });
    if (hasPendingWorkspaceRecovery(localStorage)) await recoverWorkspaceSources({ storage: localStorage, ownerId: user.id, assertCurrent });
    if (ticket !== generation.current) return;
    const binding = readWorkspaceBinding(localStorage);
    const draftBinding = readSessionDraftBinding(sessionStorage);
    const unclaimedDrafts = !draftBinding && hasSessionDrafts(sessionStorage);
    if (binding && binding.ownerId !== user.id && unclaimedDrafts) throw new Error("This tab has unlinked drafts alongside another account’s records. Sign in to the original account first to preserve and link those drafts.");
    if (binding && binding.ownerId !== user.id) { setScreen({ phase: "switch", user, message: "" }); return; }
    if ((!binding && hasWorkspaceLocalRecords(localStorage)) || unclaimedDrafts) { setScreen({ phase: "claim", user, message: "" }); return; }
    if (draftBinding && draftBinding.ownerId !== user.id) { setScreen({ phase: "switch", user, message: "" }); return; }
    if (!binding) await claimWorkspaceOwner({ storage: localStorage, ownerId: user.id, confirmed: true, assertCurrent });
    await switchSessionDraftOwner({ storage: sessionStorage, ownerId: user.id, assertCurrent });
    if (ticket !== generation.current) return;
    const active = localStorage.getItem(preferenceKey(user.id)) !== "false";
    setEnabled(active);
    const sync = createCloudWorkspaceSync({ storage: localStorage, client, ownerId: user.id, applySources: (options) => applyWorkspaceSources({ ...options, assertCurrent: () => { assertCurrent(); options.assertCurrent?.(); } }) });
    stop(); controller.current = sync;
    unsubscribe.current = sync.subscribe(() => {
      if (ticket !== generation.current) return;
      const next = sync.getStatus();
      setSyncState({ ...next });
      if (next.status === "AUTH_REQUIRED") fail(syncError(next));
    });
    if (active) {
      const initial = await sync.sync({ allowApply: true });
      assertCurrent();
      // Sync reports failures as status values; a failed rollback must never
      // allow App's normal record writers to mount over its recovery journal.
      assertNoPendingWrites();
      if (["AUTH_REQUIRED", "RECOVERY_REQUIRED"].includes(initial.status) || storageFailure(initial.status)) throw syncError(initial);
    }
    else setSyncState({ status: "PAUSED", message: "Automatic cloud saving is paused. Changes stay on this device." });
    assertNoPendingWrites();
    if (ticket === generation.current) setScreen({ phase: "ready", user, message: "" });
  }, [client, stop, fail]);

  useEffect(() => {
    if (development || !configured || !client) return undefined;
    let active = true;
    const epoch = generation;
    let initialReceived = false;
    let receiveTimer = null;
    function receive(session, force = false) {
      if (!active) return;
      initialReceived = true;
      const id = session?.user?.id || null;
      if (!force && id === identity.current && controller.current) return;
      identity.current = id;
      const ticket = ++generation.current;
      clearTimeout(receiveTimer);
      stop();
      setScreen({ phase: "checking", user: null, message: "" });
      // Leave the SDK's callback/lock lifecycle and coalesce initial auth events
      // before making provider calls. A microtask can run inside that lifecycle.
      receiveTimer = setTimeout(async () => {
        receiveTimer = null;
        if (!active || ticket !== generation.current || identity.current !== id) return;
        try {
          if (!id) {
            // Signing out cannot bypass recovery: the regular login lives inside
            // App, whose mount effects also write device records.
            if (hasPendingWrites()) {
              if (active && ticket === generation.current) setScreen({ phase: "recovery-signin", user: null, message: "" });
              return;
            }
            const assertCurrent = () => { if (!active || ticket !== generation.current) throw new Error("The account changed."); };
            if (hasPendingSessionDraftSwitch(sessionStorage)) recoverSessionDraftSwitch({ storage: sessionStorage, assertCurrent });
            if (readSessionDraftBinding(sessionStorage)) await switchSessionDraftOwner({ storage: sessionStorage, ownerId: null, assertCurrent });
            if (active && ticket === generation.current) setScreen({ phase: "signedout", user: null, message: "" });
            return;
          }
          const user = await verify(id); if (active && ticket === generation.current) await open(user, ticket);
        }
        catch (error) { if (active && ticket === generation.current) fail(error); }
      }, 0);
    }
    const { data } = client.auth.onAuthStateChange((event, session) => receive(session, event === "SIGNED_OUT"));
    const initialTicket = generation.current;
    bounded(client.auth.getSession(), "READ_SESSION").then(({ data: sessionData, error }) => {
      if (!active || initialReceived || initialTicket !== generation.current) return;
      if (error) fail(error); else receive(sessionData.session);
    }).catch((error) => { if (active && !initialReceived && initialTicket === generation.current) fail(error); });
    return () => { active = false; clearTimeout(receiveTimer); epoch.current++; data.subscription.unsubscribe(); stop(); };
  }, [client, configured, development, fail, open, stop, verify]);

  useEffect(() => {
    if (screen.phase !== "ready" || !enabled) return undefined;
    const run = () => { void controller.current?.sync({ allowApply: false }); };
    const timer = setInterval(run, 15000);
    window.addEventListener("online", run); window.addEventListener("focus", run);
    return () => { clearInterval(timer); window.removeEventListener("online", run); window.removeEventListener("focus", run); };
  }, [screen.phase, enabled]);

  useEffect(() => {
    if (screen.phase !== "ready") return undefined;
    let active = true;
    let pending = false;
    const ticket = generation.current;
    const check = async () => {
      if (pending || !navigator.onLine) return;
      pending = true;
      try { await verify(screen.user.id); }
      catch (error) { if (active && ticket === generation.current) { stop(); fail(error); } }
      finally { pending = false; }
    };
    const timer = setInterval(check, 30000);
    window.addEventListener("focus", check);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", check); };
  }, [screen.phase, screen.user, verify, stop, fail]);

  useEffect(() => {
    if (!operation || screen.phase !== "operation") return undefined;
    let active = true;
    const ticket = generation.current;
    const abort = new AbortController();
    const assertCurrent = () => {
      if (!active || abort.signal.aborted || ticket !== generation.current || identity.current !== screen.user.id) throw new Error("The account changed. This operation was cancelled.");
    };
    // This effect runs after App and its shared storage lease have unmounted.
    Promise.resolve().then(async () => {
      const user = await verify(screen.user.id);
      if (!active || ticket !== generation.current) return;
      await controller.current?.waitForIdle();
      assertCurrent();
      await operation.run({ user, sync: controller.current, signal: abort.signal, assertCurrent });
      if (!active || ticket !== generation.current) return;
      await verify(user.id);
      if (active && ticket === generation.current) window.location.reload();
    }).catch((error) => { if (active && ticket === generation.current) { setOperation(null); fail(error); } });
    return () => { active = false; abort.abort(); };
  }, [operation, screen.phase, screen.user, verify, fail]);

  const runExclusive = useCallback((run) => {
    setOperation({ run });
    setScreen((value) => ({ ...value, phase: "operation", message: "" }));
  }, []);
  const setCloudEnabled = (next) => {
    localStorage.setItem(preferenceKey(screen.user.id), String(next));
    setEnabled(next);
    if (next) void controller.current?.sync();
    else setSyncState({ status: "PAUSED", message: "Automatic cloud saving is paused. Changes stay on this device." });
  };
  const value = { user: screen.user, enabled, status: syncState, setEnabled: setCloudEnabled, runExclusive,
    syncNow: () => controller.current?.sync(), history: () => controller.current?.history(), readRevision: (revision) => controller.current?.readRevision(revision),
    listDeviceRecoveryCopies: () => controller.current?.listDeviceRecoveryCopies(), readDeviceRecoveryCopy: (copyId) => controller.current?.readDeviceRecoveryCopy(copyId),
    exportCloudBackup: (signal) => exportLegacyCloudBackup({ client, userId: screen.user.id, signal }),
    reviewConflicts: () => controller.current?.previewConflicts(),
    resolveConflicts: (reviewId, choices) => runExclusive(({ sync }) => sync.resolveConflicts({ reviewId, choices, confirmed: true })),
    openRecovery: () => setScreen((current) => ({ ...current, phase: "restore" })),
    loadNewer: () => runExclusive(async ({ sync }) => { const result = await sync.sync({ allowApply: true }); if (!["SYNCED", "PENDING"].includes(result.status)) throw syncError(result); }),
  };

  async function restore({ raw, plan, password, signal }) {
    const ticket = generation.current;
    const user = await verify(screen.user.id);
    const assertCurrent = () => {
      if (signal.aborted || ticket !== generation.current || identity.current !== user.id || readWorkspaceBinding(localStorage)?.ownerId !== user.id) throw new Error("The account changed. Recovery was cancelled.");
    };
    await controller.current?.waitForIdle();
    assertCurrent();
    const latest = await planWorkspaceRestore(raw, { storage: localStorage });
    if (latest.plan.planHash !== plan.planHash) throw new Error("Records changed after the preview. Choose the backup again to review the updated recovery.");
    const confirmation = await confirmAccountOperation({ purpose: "BACKUP_RECOVERY", planDigest: plan.planHash, password, userId: user.id, signal });
    if (signal.aborted || ticket !== generation.current) throw new Error("The account changed. Recovery was cancelled.");
    await consumeAccountConfirmation(confirmation, { signal });
    if (signal.aborted || ticket !== generation.current) throw new Error("Recovery was cancelled before changing records.");
    await applyWorkspaceSources({ storage: localStorage, expectedSources: latest.expectedSources, nextSources: latest.nextSources, ownerId: user.id, assertCurrent });
    window.location.reload();
  }

  async function restoreCloud({ raw, plan, password, signal }) {
    const ticket = generation.current;
    const user = await verify(screen.user.id);
    const assertCurrent = () => {
      if (signal.aborted || ticket !== generation.current || identity.current !== user.id) throw new Error("The account changed. Cloud recovery was cancelled.");
    };
    await controller.current?.waitForIdle();
    const reviewed = await inspectLegacyCloudBackup(raw, { userId: user.id });
    assertCurrent();
    if (reviewed.planDigest !== plan.planHash) throw new Error("The backup changed after review. Choose it again.");
    const confirmation = await confirmAccountOperation({ purpose: "CLOUD_RESTORE", planDigest: reviewed.planDigest, password, userId: user.id, signal });
    assertCurrent();
    const result = await restoreLegacyCloudBackup({ client, raw, confirmation, userId: user.id, signal });
    assertCurrent();
    return result;
  }

  if (screen.phase === "passthrough") return <CloudWorkspaceContext.Provider value={null}>{children}</CloudWorkspaceContext.Provider>;
  if (screen.phase === "recovery-signin") return <WorkspaceScreen title="Sign in to recover your records"><WorkspaceRecoverySignIn client={client} /></WorkspaceScreen>;
  if (screen.phase === "signedout") return <CloudWorkspaceContext.Provider value={null}><WorkspaceLease onError={fail}>{children}</WorkspaceLease></CloudWorkspaceContext.Provider>;
  if (screen.phase === "restore") return <WorkspaceScreen title="Recover your saved records"><WorkspaceRestorePanel userId={screen.user.id} onRestore={restore} onRestoreCloud={restoreCloud} onCancel={() => window.location.reload()} /></WorkspaceScreen>;
  if (screen.phase === "ready") return <CloudWorkspaceContext.Provider value={value}><WorkspaceLease onError={fail}>{children}
    <WorkspaceSyncNotice status={syncState} ownerId={screen.user.id} onLoadNewer={value.loadNewer} />
  </WorkspaceLease></CloudWorkspaceContext.Provider>;
  if (screen.phase === "checking" || screen.phase === "operation") return <WorkspaceScreen title={screen.phase === "operation" ? "Protecting and updating your records" : "Checking your account"}><p>Please keep this page open.</p></WorkspaceScreen>;
  return <WorkspaceScreen title={screen.phase === "claim" ? "Keep your existing records" : screen.phase === "switch" ? "Open this account’s records" : storageFailure(screen.code) ? "Device storage needs attention" : screen.code === "RECOVERY_REQUIRED" ? "Your saved records need recovery" : "Your records are safe"}>
    {screen.phase === "claim" ? <><p>This browser has saved records or drafts that haven’t been linked to an account. Confirm that they belong to <strong>{screen.user.email}</strong> before saving a cloud copy.</p><p>Your original device copy will be retained.</p><button type="button" onClick={() => runExclusive(async ({ user, assertCurrent }) => { await claimWorkspaceOwner({ storage: localStorage, ownerId: user.id, confirmed: true, assertCurrent }); await switchSessionDraftOwner({ storage: sessionStorage, ownerId: user.id, confirmed: true, assertCurrent }); })}>These are my records</button></>
      : screen.phase === "switch" ? <><p>This browser’s current records or drafts belong to a different account. We’ll retain that account’s device copy before opening <strong>{screen.user.email}</strong>.</p><button type="button" onClick={() => runExclusive(async ({ user, assertCurrent }) => { if (!readWorkspaceBinding(localStorage)) await claimWorkspaceOwner({ storage: localStorage, ownerId: user.id, confirmed: true, assertCurrent }); else await switchWorkspaceOwner({ storage: localStorage, ownerId: user.id, confirmed: true, assertCurrent }); await switchSessionDraftOwner({ storage: sessionStorage, ownerId: user.id, assertCurrent }); })}>Preserve and switch accounts</button></>
        : <><p role="alert">{screen.message}</p>{storageFailure(screen.code) && <p>Keep this app’s stored data. Close other Code 3 TCG tabs, then retry. Do not clear app data or uninstall while this device has unsynced records.</p>}<button type="button" onClick={() => window.location.reload()}>Retry safely</button></>}
    <button type="button" className="cloud-secondary" onClick={() => { void client.auth.signOut({ scope: "local" }).then(({ error }) => { if (error) fail(error); }); }}>Sign out</button>
    {screen.phase === "error" && <WorkspaceSupportDetails stage={screen.stage} code={screen.code} />}
  </WorkspaceScreen>;
}
