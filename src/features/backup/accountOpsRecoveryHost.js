import { accountOpsExclusive } from "../accountOps/operationCoordinator.js";
import { ACCOUNT_OPS_RESTORE_LOCK } from "../accountOps/recoveryState.js";
import { getBackupSource } from "./backupSourceRegistry.js";
import { createVerifiedBackup } from "./backupFormat.js";
import { createAccountOpsRestoreExecutor } from "./accountOpsRestore.js";

// Capability injection is deliberate: the host must supply a current owner check
// and a fresh, same-owner challenge. A recent JWT issuance is not reauthentication.
export function createAccountOpsRecoveryHost({ storage, locks, authorizeOwner, challengeOwner, now = Date.now } = {}) {
  const exclusive = accountOpsExclusive(storage, { locks, requireCrossTabLock: true });
  let generation = 0;
  let approval = null;
  const executor = createAccountOpsRestoreExecutor({ storage, runExclusive: exclusive, authorize: async ({ planHash }) => {
    const grant = approval;
    if (!grant || grant.planHash !== planHash || grant.expiresAt <= now() || grant.generation !== generation) return false;
    const owner = await authorizeOwner?.();
    return Boolean(owner?.authorized && owner.identity === grant.identity && approval === grant && grant.generation === generation && grant.expiresAt > now());
  } });
  return Object.freeze({
    cancel() { generation++; approval = null; },
    plan(raw) { generation++; approval = null; return executor.plan(raw); },
    pendingPlan() { generation++; approval = null; return executor.pendingPlan(); },
    async export() {
      const request = generation;
      const owner = await authorizeOwner?.();
      if (!owner?.authorized) throw new Error("Current owner authorization is required.");
      return exclusive(ACCOUNT_OPS_RESTORE_LOCK, async () => {
        const current = await authorizeOwner();
        if (!current?.authorized || current.identity !== owner.identity) throw new Error("The owner session changed.");
        const result = await createVerifiedBackup({ localStorage: storage, sourceRegistry: [getBackupSource("account-ops")], applicationVersion: "Account Ops scoped recovery" });
        const after = await authorizeOwner();
        if (request !== generation || !after?.authorized || after.identity !== owner.identity) throw new Error("The owner session changed during export.");
        if (!result.verified) throw new Error("Account Ops backup verification failed.");
        return { ...result, fileName: result.fileName.replace("code-3-backup", "code-3-account-ops"), scope: "ACCOUNT_OPS_ONLY" };
      });
    },
    async confirm(plan) {
      const version = ++generation;
      approval = null;
      const owner = await authorizeOwner?.();
      if (!owner?.authorized || !owner.identity) throw new Error("Current owner authorization is required.");
      const startedAt = now();
      const proof = await challengeOwner?.({ identity: owner.identity, planHash: plan.planHash, startedAt });
      const current = await authorizeOwner();
      if (generation !== version || !proof?.verified || proof.identity !== owner.identity || proof.planHash !== plan.planHash
        || !Number.isFinite(proof.authenticatedAt) || proof.authenticatedAt < startedAt || proof.authenticatedAt > now()
        || !current?.authorized || current.identity !== owner.identity || now() - startedAt > 120_000) {
        throw new Error("Fresh owner confirmation was cancelled, expired, or could not be verified.");
      }
      approval = { identity: owner.identity, planHash: plan.planHash, generation: version, expiresAt: Math.min(now() + 60_000, startedAt + 120_000) };
      return { confirmedPlanHash: plan.planHash, expiresAt: approval.expiresAt };
    },
    async apply(input) {
      try { return await executor.apply(input); }
      finally { generation++; approval = null; }
    },
    async recover() { try { return await executor.recover(); } finally { generation++; approval = null; } },
  });
}
