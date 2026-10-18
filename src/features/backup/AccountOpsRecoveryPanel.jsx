import { useEffect, useRef, useState } from "react";
import { PrimaryButton, SecondaryButton } from "../../components/operations/OperationsUI.jsx";
import { accountOpsExclusive } from "../accountOps/operationCoordinator.js";
import { ACCOUNT_OPS_RESTORE_LOCK } from "../accountOps/recoveryState.js";
import { createVerifiedBackup } from "./backupFormat.js";
import { getBackupSource } from "./backupSourceRegistry.js";
import { planAccountOpsRestore } from "./accountOpsRestore.js";
import { exportFile, exportFileStatus, exportFileError } from "../../native/nativeFiles.js";
import { useCloudWorkspace } from "../persistence/CloudWorkspaceContext.js";

export default function AccountOpsRecoveryPanel({ recoveryHost = null }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [plan, setPlan] = useState(null);
  const rawRef = useRef(null);
  const version = useRef(0);
  const exportRequest = useRef(null);
  const ownerId = useCloudWorkspace()?.user?.id;
  useEffect(() => () => { version.current++; rawRef.current = null; exportRequest.current?.abort(); recoveryHost?.cancel(); }, [recoveryHost, ownerId]);
  async function exportScope() {
    if (exportRequest.current) return;
    const controller = new AbortController(); exportRequest.current = controller;
    setBusy(true); setMessage("");
    const request = ++version.current;
    try {
      const result = recoveryHost ? await recoveryHost.export() : await accountOpsExclusive(globalThis.localStorage) (ACCOUNT_OPS_RESTORE_LOCK, () => createVerifiedBackup({ localStorage: globalThis.localStorage, sourceRegistry: [getBackupSource("account-ops")] }));
      if (request !== version.current) return;
      if (!result.verified) throw new Error("Account Ops could not be exported safely.");
      let saved;
      try { saved = await exportFile({ blob: new Blob([result.json], { type: "application/json" }), filename: result.fileName.replace("code-3-backup", "code-3-account-ops"), signal: controller.signal }); }
      catch (error) { throw new Error(exportFileError(error)); }
      if (request !== version.current) return;
      setMessage(`${exportFileStatus(saved)} Account Ops-only backup verified. Other app records and file bytes are excluded.`);
    } catch (error) { if (request === version.current) setMessage(error.message); }
    finally { if (exportRequest.current === controller) exportRequest.current = null; if (request === version.current) setBusy(false); }
  }
  async function inspect(event) {
    const file = event.target.files?.[0]; event.target.value = "";
    const request = ++version.current;
    recoveryHost?.cancel(); rawRef.current = null; setPlan(null); setMessage("");
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 1024 * 1024) throw new Error("Choose an Account Ops-only backup smaller than 1 MB.");
      const raw = await file.text();
      if (request !== version.current) return;
      const next = recoveryHost ? await recoveryHost.plan(raw) : await planAccountOpsRestore(raw, { storage: globalThis.localStorage });
      if (request !== version.current) return;
      rawRef.current = raw; setPlan(next); setMessage("The Account Ops restore plan is ready for review. No records changed.");
    } catch (error) { if (request === version.current) setMessage(error.message); }
    finally { if (request === version.current) setBusy(false); }
  }
  async function restore() {
    if (!recoveryHost || !plan || !rawRef.current) return;
    setBusy(true); setMessage("");
    const request = ++version.current;
    try {
      const proof = await recoveryHost.confirm(plan);
      if (request !== version.current) return;
      const result = await recoveryHost.apply({ raw: rawRef.current, plan, confirmedPlanHash: proof.confirmedPlanHash });
      if (request !== version.current) return;
      rawRef.current = null; setPlan(null);
      setMessage(result.status === "APPLIED" ? "Account Ops restored with a durable completion receipt. Reload Account Ops to open the recovered records." : "Recovery requires review before reopening records.");
    } catch (error) { if (request === version.current) setMessage(error.message); }
    finally { if (request === version.current) setBusy(false); }
  }
  return <section className="backup-result" aria-label="Account Ops recovery"><h3>Account Ops recovery</h3><p>Export accounts, profiles and their related metadata. Restore supports an empty Account Ops destination and never replaces existing records.</p><div className="backup-actions"><SecondaryButton disabled={busy} onClick={exportScope}>Export Account Ops only</SecondaryButton><label>Select Account Ops backup<input type="file" accept=".json,application/json" disabled={busy} onChange={inspect} /></label></div>{message ? <p role="status">{message}</p> : null}{plan ? <div><h4>Restore scope</h4><ul>{Object.entries(plan.recordCounts).map(([name, count]) => <li key={name}>{name}: {count}</li>)}</ul><p>Purchases, Inventory, Bot operations, remote records and file bytes are excluded.</p><PrimaryButton onClick={restore} disabled={busy || !recoveryHost}>Verify owner and restore Account Ops</PrimaryButton><SecondaryButton disabled={busy} onClick={() => { version.current++; recoveryHost?.cancel(); rawRef.current = null; setPlan(null); }}>Cancel</SecondaryButton></div> : null}{!recoveryHost ? <p>Restore is unavailable until fresh owner verification is connected. Export and plan review are available.</p> : null}</section>;
}
