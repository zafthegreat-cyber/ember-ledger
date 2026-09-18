import type { MailboxProviderId } from "./contracts";

export type ProviderAuditAction =
  | "PROVIDER_CONNECTION_INITIATED"
  | "PROVIDER_CONNECTION_COMPLETED"
  | "PROVIDER_AUTHORIZATION_REFRESHED"
  | "PROVIDER_STATUS_VIEWED"
  | "PROVIDER_CAPABILITIES_VIEWED"
  | "PROVIDER_DISCONNECT_REQUESTED"
  | "PROVIDER_DISCONNECT_REJECTED"
  | "PROVIDER_AUTHORIZATION_REVOKED";

export type ProviderAuditSummary = Readonly<{
  action: ProviderAuditAction;
  outcome: "ALLOWED" | "DENIED" | "UNAVAILABLE";
  occurredAt: string;
  provider?: MailboxProviderId;
  connectionId?: string;
  errorCode?: string;
}>;

export interface ProviderAuditSink {
  write(summary: ProviderAuditSummary): void | Promise<void>;
}

/** Durable audit storage is future work. This sink intentionally records no owner data or message content. */
export function createNoopProviderAuditSink(): ProviderAuditSink {
  return Object.freeze({ write: () => undefined });
}
