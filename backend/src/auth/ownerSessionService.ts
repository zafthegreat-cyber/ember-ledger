import { randomBytes, randomUUID } from "node:crypto";
import type { OwnerContext } from "../code3/types";
import { GRANT_PURPOSES, securityDigest, sessionError, type GrantPurpose, type OwnerDeviceSession, type OwnerSecurityState, type OwnerSecurityStore, type SecurityAuditAction } from "./sessionLedger";

/** Created only by a server identity adapter after verifying the provider session, never from a
 * request body, localStorage, JWT issuedAt, user_metadata, or a browser device identifier. */
export type VerifiedOwnerSession = { owner: OwnerContext; providerSessionId: string };
export type FreshOwnerVerification = { ownerSubject: string; providerSessionId: string; verifiedAt: number; intentDigest: string; verificationId: string };
type Options = {
  store: OwnerSecurityStore;
  now?: () => number;
  // Must verify a new challenge/reauthentication event for exactly this intent; JWT refresh is not proof.
  verifyFreshOwner?: (session: VerifiedOwnerSession, intent: { purpose: GrantPurpose; planDigest: string; intentDigest: string }, proof: unknown) => Promise<FreshOwnerVerification | null>;
};
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export class OwnerSessionService {
  private readonly now: () => number;
  constructor(private readonly options: Options) { this.now = options.now || Date.now; }
  private identity(session: VerifiedOwnerSession) {
    const { owner, providerSessionId } = session || {};
    if (!owner?.principal || owner.ownerSubject !== `${owner.principal.provider}:${owner.principal.subject}` || !owner.principal.subject
      || !Number.isFinite(owner.principal.expiresAt) || owner.principal.expiresAt * 1000 <= this.now()
      || typeof providerSessionId !== "string" || providerSessionId.length < 16 || providerSessionId.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(providerSessionId)) throw sessionError("verified_session_required", 401, "A current verified owner session is required.");
    return securityDigest(`${owner.principal.provider}:${providerSessionId}`);
  }
  private active(state: OwnerSecurityState, session: VerifiedOwnerSession): OwnerDeviceSession {
    const sessionHash = this.identity(session);
    const record = state.sessions.find((candidate) => candidate.sessionHash === sessionHash);
    if (!record || record.revokedAt) throw sessionError("owner_session_revoked", 401, "This app session is unavailable or has been revoked. Sign in again.");
    return record;
  }
  private append(state: OwnerSecurityState, action: SecurityAuditAction, sessionId: string | null, planDigest: string | null = null, count: number | null = null) {
    if (state.audit.length >= 4096) throw sessionError("security_audit_full", 503, "Owner security history requires archival review before continuing.");
    const body = { id: randomUUID(), sequence: state.audit.length + 1, action, at: new Date(this.now()).toISOString(), sessionId, planDigest, count, previousHash: state.audit[state.audit.length - 1]?.sha256 || null };
    state.audit.push({ ...body, sha256: securityDigest(JSON.stringify(body)) });
  }
  private publicSession(record: OwnerDeviceSession, currentHash: string) {
    const { sessionHash, ...safe } = record;
    return { ...safe, current: sessionHash === currentHash };
  }

  async register(session: VerifiedOwnerSession, label = "Signed-in device") {
    const sessionHash = this.identity(session);
    if (typeof label !== "string" || !label.trim() || label.length > 80 || /[\x00-\x1f\x7f]/.test(label)) throw sessionError("invalid_session_label", 400, "Use a device name of 1–80 readable characters.");
    return this.options.store.transaction(session.owner, async (state) => {
      const existing = state.sessions.find((record) => record.sessionHash === sessionHash);
      if (existing?.revokedAt) throw sessionError("owner_session_revoked", 401, "This app session has been revoked. Sign in again.");
      const timestamp = new Date(this.now()).toISOString();
      if (existing) {
        existing.lastSeenAt = timestamp;
        existing.expiresAt = new Date(session.owner.principal.expiresAt * 1000).toISOString();
        return this.publicSession(existing, sessionHash);
      }
      if (state.sessions.length >= 128) throw sessionError("session_limit_reached", 409, "Session history requires archival review before adding another device.");
      const record = { id: randomUUID(), sessionHash, label: label.trim(), firstSeenAt: timestamp, lastSeenAt: timestamp, expiresAt: new Date(session.owner.principal.expiresAt * 1000).toISOString(), revokedAt: null };
      state.sessions.push(record);
      this.append(state, "SESSION_REGISTERED", record.id);
      return this.publicSession(record, sessionHash);
    });
  }

  async assertActive(session: VerifiedOwnerSession) {
    this.identity(session);
    this.active(await this.options.store.read(session.owner), session);
  }

  async list(session: VerifiedOwnerSession) {
    const sessionHash = this.identity(session);
    const state = await this.options.store.read(session.owner);
    this.active(state, session);
    return state.sessions.map((record) => this.publicSession(record, sessionHash));
  }

  revokeIntent(targetSessionId: string) { return securityDigest(JSON.stringify({ action: "REVOKE_APP_SESSION", targetSessionId })); }

  async revoke(session: VerifiedOwnerSession, targetSessionId: unknown, grant: unknown) {
    this.identity(session);
    if (typeof targetSessionId !== "string" || !/^[a-f0-9-]{36}$/.test(targetSessionId)) throw sessionError("session_not_found", 404, "The device session was not found.");
    return this.options.store.transaction(session.owner, async (state) => {
      const current = this.active(state, session);
      const target = state.sessions.find((record) => record.id === targetSessionId);
      if (!target) throw sessionError("session_not_found", 404, "The device session was not found.");
      this.consume(state, session, "SESSION_REVOKE", this.revokeIntent(targetSessionId), grant);
      target.revokedAt = new Date(this.now()).toISOString();
      this.append(state, "SESSION_REVOKED", target.id);
      return { id: target.id, revokedAt: target.revokedAt, current: target.id === current.id, scope: "CODE3_APP" as const };
    });
  }

  async issueGrant(session: VerifiedOwnerSession, purpose: unknown, planDigest: unknown, proof: unknown) {
    this.identity(session);
    if (!GRANT_PURPOSES.includes(purpose as GrantPurpose) || !hash(planDigest)) throw sessionError("invalid_reauthentication_intent", 400, "A supported operation and exact preview digest are required.");
    if (!this.options.verifyFreshOwner) throw sessionError("fresh_owner_verification_unavailable", 503, "Fresh owner verification is not configured.");
    const operation = purpose as GrantPurpose;
    const intentDigest = securityDigest(JSON.stringify({ purpose: operation, planDigest, sessionHash: this.identity(session) }));
    return this.options.store.transaction(session.owner, async (state) => {
      const current = this.active(state, session);
      const startedAt = this.now();
      const verification = await this.options.verifyFreshOwner!(session, { purpose: operation, planDigest, intentDigest }, proof);
      this.identity(session);
      if (!verification || verification.ownerSubject !== session.owner.ownerSubject || verification.providerSessionId !== session.providerSessionId
        || verification.intentDigest !== intentDigest || !Number.isFinite(verification.verifiedAt)
        || typeof verification.verificationId !== "string" || !/^[A-Za-z0-9._:-]{16,200}$/.test(verification.verificationId)
        || verification.verifiedAt < startedAt - 120000 || verification.verifiedAt > this.now() || this.now() - verification.verifiedAt > 120000) {
        throw sessionError("fresh_owner_verification_required", 403, "Complete fresh owner verification for this exact operation.");
      }
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Math.min(this.now() + 300000, session.owner.principal.expiresAt * 1000)).toISOString();
      state.grants = state.grants.filter((entry) => Date.parse(entry.expiresAt) > this.now());
      const verificationHash = securityDigest(verification.verificationId);
      if (state.grants.some((entry) => entry.verificationHash === verificationHash)) throw sessionError("fresh_verification_already_used", 403, "This verification was already used. Complete a new owner confirmation.");
      if (state.grants.length >= 256) throw sessionError("reauthentication_limit_reached", 409, "Too many confirmation requests are pending.");
      state.grants.push({ tokenHash: securityDigest(token), verificationHash, sessionHash: this.identity(session), planDigest, purpose: operation, expiresAt, usedAt: null });
      this.append(state, "GRANT_ISSUED", current.id, planDigest);
      return { grant: token, purpose: operation, planDigest, expiresAt };
    });
  }

  private consume(state: OwnerSecurityState, session: VerifiedOwnerSession, purpose: GrantPurpose, planDigest: string, token: unknown) {
    const current = this.active(state, session);
    const grant = typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token) ? state.grants.find((entry) => entry.tokenHash === securityDigest(token)) : undefined;
    if (!grant || grant.usedAt || grant.sessionHash !== this.identity(session) || grant.purpose !== purpose || grant.planDigest !== planDigest || Date.parse(grant.expiresAt) <= this.now()) throw sessionError("owner_grant_invalid", 403, "The owner confirmation is expired, already used, or belongs to another operation.");
    grant.usedAt = new Date(this.now()).toISOString();
    this.append(state, "GRANT_CONSUMED", current.id, planDigest);
  }

  async consumeGrant(session: VerifiedOwnerSession, purpose: GrantPurpose, planDigest: string, token: unknown): Promise<true> {
    this.identity(session);
    return this.options.store.transaction(session.owner, async (state) => { this.consume(state, session, purpose, planDigest, token); return true as const; });
  }

  async recordRecoveryOutcome(session: VerifiedOwnerSession, planDigest: string, outcome: "COMPLETED" | "FAILED", count: number) {
    this.identity(session);
    if (!hash(planDigest) || !["COMPLETED", "FAILED"].includes(outcome) || !Number.isSafeInteger(count) || count < 0 || count > 1000000) throw sessionError("invalid_audit_summary", 400, "A bounded recovery summary is required.");
    return this.options.store.transaction(session.owner, async (state) => {
      const current = this.active(state, session);
      this.append(state, outcome === "COMPLETED" ? "RECOVERY_COMPLETED" : "RECOVERY_FAILED", current.id, planDigest, count);
    });
  }

  async audit(session: VerifiedOwnerSession) {
    this.identity(session);
    const state = await this.options.store.read(session.owner);
    this.active(state, session);
    return { entries: state.audit, scope: "CODE3_APP" as const, complete: true };
  }
}
