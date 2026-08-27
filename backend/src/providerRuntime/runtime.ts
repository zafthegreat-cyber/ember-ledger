import type { AuthPrincipal } from "../auth/authPrincipal";
import { MAILBOX_PROVIDER_RUNTIME_VERSION, ownerContextFromPrincipal } from "./contracts";
import type { ProviderAuditSink } from "./audit";
import { createNoopProviderAuditSink } from "./audit";
import type { ProviderConnectionStore } from "./connectionStore";
import { createUnavailableProviderConnectionStore } from "./connectionStore";
import { ProviderRuntimeError } from "./errors";
import type { OAuthStateStore } from "./oauthStateStore";
import { createUnavailableOAuthStateStore } from "./oauthStateStore";
import type { MailboxProviderRegistry } from "./providerRegistry";
import { mailboxProviderRegistry } from "./providerRegistry";
import type { ServerMailboxProviderAdapter } from "./providerAdapter";
import type { ProviderSecretStore } from "./secretStore";
import { createUnavailableProviderSecretStore } from "./secretStore";
import { resolveTrustedRuntimeProof, type TrustedRuntimeProof } from "./trustedRuntime";

const CONNECTION_ID_PATTERN = /^connection:[a-z0-9][a-z0-9._:-]{7,159}$/i;

type RuntimeOptions = {
  registry?: MailboxProviderRegistry;
  connectionStore?: ProviderConnectionStore;
  secretStore?: ProviderSecretStore;
  oauthStateStore?: OAuthStateStore;
  providerAdapters?: readonly ServerMailboxProviderAdapter[];
  audit?: ProviderAuditSink;
  now?: () => Date;
  hostedRuntimeVerified?: boolean;
  trustedRuntimeProof?: TrustedRuntimeProof;
};

export function validateConnectionId(value: unknown): string {
  const connectionId = typeof value === "string" ? value.trim() : "";
  if (!CONNECTION_ID_PATTERN.test(connectionId)) {
    throw new ProviderRuntimeError("invalid_provider_request", "The provider connection identifier is invalid.", 400);
  }
  return connectionId;
}

export function createProviderRuntime(options: RuntimeOptions = {}) {
  const registry = options.registry || mailboxProviderRegistry;
  const connectionStore = options.connectionStore || createUnavailableProviderConnectionStore();
  const secretStore = options.secretStore || createUnavailableProviderSecretStore();
  const oauthStateStore = options.oauthStateStore || createUnavailableOAuthStateStore();
  const providerAdapters = new Map((options.providerAdapters || []).map((adapter) => [adapter.providerId, adapter]));
  const audit = options.audit || createNoopProviderAuditSink();
  const now = options.now || (() => new Date());
  const trustedRuntimeProof = options.trustedRuntimeProof || resolveTrustedRuntimeProof();
  const hostedRuntimeVerified = options.hostedRuntimeVerified === undefined
    ? trustedRuntimeProof.hostedRuntimeVerified
    : options.hostedRuntimeVerified === true && trustedRuntimeProof.hostedRuntimeVerified;

  function recordAudit(summary: Parameters<ProviderAuditSink["write"]>[0]) {
    try {
      const result = audit.write(summary);
      if (result && typeof result.then === "function") void result.catch(() => undefined);
    } catch {
      // Provider operations must never fail or disclose data because a diagnostic sink failed.
    }
  }

  function baseStatus() {
    const available = hostedRuntimeVerified
      && connectionStore.available
      && secretStore.available
      && oauthStateStore.available
      && providerAdapters.size > 0;
    return Object.freeze({
      runtimeVersion: MAILBOX_PROVIDER_RUNTIME_VERSION,
      available,
      hostedRuntimeVerified,
      trustedRuntimeProof: Object.freeze({
        ...trustedRuntimeProof,
        hostedRuntimeVerified,
      }),
      liveProviderConnected: false,
      connectionStorage: Object.freeze({ available: connectionStore.available, kind: connectionStore.kind }),
      secretStorage: Object.freeze({ available: secretStore.available, kind: secretStore.kind }),
      oauthStateStorage: Object.freeze({ available: oauthStateStore.available, kind: oauthStateStore.kind }),
      automaticPurchaseCreation: false,
      canonicalPersistenceRequired: false,
      localOnlyBusinessDataAuthoritative: true,
      detail: hostedRuntimeVerified
        ? "The trusted Preview runtime is available. Provider authorization remains unavailable until durable server-only stores and a mailbox adapter are configured."
        : "Provider authorization is unavailable until a durable server-only secret store and single-use OAuth state store are configured and the hosted API runtime is verified.",
    });
  }

  return Object.freeze({
    capabilities(principal: AuthPrincipal) {
      ownerContextFromPrincipal(principal);
      recordAudit({ action: "PROVIDER_CAPABILITIES_VIEWED", outcome: "ALLOWED", occurredAt: now().toISOString() });
      return Object.freeze({ ...baseStatus(), providers: registry.list() });
    },
    async status(principal: AuthPrincipal) {
      const owner = ownerContextFromPrincipal(principal);
      recordAudit({ action: "PROVIDER_STATUS_VIEWED", outcome: "ALLOWED", occurredAt: now().toISOString() });
      const connections = connectionStore.available ? await connectionStore.list(owner) : Object.freeze([]);
      const status = baseStatus();
      return Object.freeze({
        ...status,
        // A metadata record alone never proves a live, trusted provider runtime.
        liveProviderConnected: status.available && connections.some((connection) => connection.status === "HEALTHY"),
        connections,
      });
    },
    async disconnect(principal: AuthPrincipal, rawConnectionId: unknown) {
      const connectionId = validateConnectionId(rawConnectionId);
      const owner = ownerContextFromPrincipal(principal);
      if (!connectionStore.available || !secretStore.available) {
        recordAudit({ action: "PROVIDER_DISCONNECT_REQUESTED", outcome: "UNAVAILABLE", occurredAt: now().toISOString(), connectionId });
        throw new ProviderRuntimeError(
          "provider_runtime_unavailable",
          "No mailbox provider connection is active, so there is nothing to disconnect.",
          503,
        );
      }
      const connection = await connectionStore.get(owner, connectionId);
      if (!connection) throw new ProviderRuntimeError("provider_connection_not_found", "The provider connection was not found.", 404);
      const secret = await secretStore.get(owner, connectionId);
      const adapter = providerAdapters.get(connection.provider);
      const disconnectedAt = now().toISOString();

      // Stop all future Code 3 reads before attempting remote revocation. Even if
      // the provider or managed secret store fails, this trusted runtime will no
      // longer consider the connection eligible for processing.
      let updated = await connectionStore.markDisconnected(owner, connectionId, {
        status: "DISCONNECTED",
        revokedAt: null,
        errorCode: null,
      });
      let providerAuthorizationRevoked = false;
      let providerRevocationFailed = false;
      if (adapter && secret && adapter.supportsAuthorizationRevocation) {
        try {
          const result = await adapter.disconnect({ connection, secret });
          providerAuthorizationRevoked = result.providerAuthorizationRevoked === true;
        } catch {
          providerRevocationFailed = true;
        }
      }
      let secretRevocationFailed = false;
      try {
        const removed = await secretStore.revoke(owner, connectionId, disconnectedAt);
        if (secret && !removed) secretRevocationFailed = true;
      } catch {
        secretRevocationFailed = true;
      }
      const providerRevocationUnavailable = !adapter || !secret || !adapter.supportsAuthorizationRevocation;
      const providerRevocationUnverified = !providerRevocationUnavailable
        && !providerRevocationFailed
        && !providerAuthorizationRevoked;
      const errorCode = providerRevocationFailed && secretRevocationFailed
        ? "PROVIDER_AND_SECRET_REVOCATION_FAILED"
        : providerRevocationFailed
          ? "PROVIDER_REVOCATION_FAILED"
          : secretRevocationFailed
            ? "SECRET_REVOCATION_FAILED"
            : providerRevocationUnavailable
              ? "PROVIDER_REVOCATION_UNAVAILABLE"
              : providerRevocationUnverified
                ? "PROVIDER_REVOCATION_UNVERIFIED"
              : null;
      updated = await connectionStore.markDisconnected(owner, connectionId, {
        status: providerAuthorizationRevoked ? "REVOKED" : "DISCONNECTED",
        revokedAt: providerAuthorizationRevoked ? disconnectedAt : null,
        errorCode,
      });
      recordAudit({
        action: "PROVIDER_DISCONNECT_REQUESTED",
        outcome: "ALLOWED",
        occurredAt: disconnectedAt,
        provider: connection.provider,
        connectionId,
        ...(errorCode ? { errorCode } : {}),
      });
      if (providerAuthorizationRevoked) {
        recordAudit({
          action: "PROVIDER_AUTHORIZATION_REVOKED",
          outcome: "ALLOWED",
          occurredAt: disconnectedAt,
          provider: connection.provider,
          connectionId,
        });
      }
      return Object.freeze({
        connection: updated,
        providerAuthorizationRevoked,
        futureReadsAllowed: false,
        warnings: errorCode
          ? Object.freeze([
            secretRevocationFailed
              ? "Code 3 stopped future reads, but removal of the managed secret could not be verified."
              : "Provider authorization revocation could not be verified; Code 3 removed its local secret reference and stopped future reads.",
          ])
          : Object.freeze([]),
      });
    },
    async connectionForProcessing(principal: AuthPrincipal, rawConnectionId: unknown) {
      const connectionId = validateConnectionId(rawConnectionId);
      const owner = ownerContextFromPrincipal(principal);
      if (!baseStatus().available) {
        throw new ProviderRuntimeError("provider_runtime_unavailable", "Provider processing is unavailable.", 503);
      }
      const connection = await connectionStore.get(owner, connectionId);
      if (!connection || connection.status !== "HEALTHY") {
        throw new ProviderRuntimeError("provider_connection_not_found", "No active provider connection is available.", 404);
      }
      const secret = await secretStore.get(owner, connectionId);
      if (!secret) throw new ProviderRuntimeError("provider_connection_not_found", "No active provider connection is available.", 404);
      if (!providerAdapters.has(connection.provider)) {
        throw new ProviderRuntimeError("provider_runtime_unavailable", "Provider processing is unavailable.", 503);
      }
      return Object.freeze({ connection, secret });
    },
  });
}

const trustedRuntimeProof = resolveTrustedRuntimeProof();

export const providerRuntime = createProviderRuntime({ trustedRuntimeProof });
