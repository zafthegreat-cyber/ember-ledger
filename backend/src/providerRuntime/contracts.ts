import type { AuthPrincipal } from "../auth/authPrincipal";

export const MAILBOX_PROVIDER_RUNTIME_VERSION = "code3.mailbox-provider-runtime.v1" as const;

export const PROVIDER_CONNECTION_STATUSES = Object.freeze([
  "DISCONNECTED",
  "CONNECTING",
  "HEALTHY",
  "NEEDS_REAUTH",
  "ERROR",
  "REVOKED",
] as const);

export type ProviderConnectionStatus = typeof PROVIDER_CONNECTION_STATUSES[number];
export type MailboxProviderId = "gmail" | "microsoft-outlook";

export type MailboxProviderCapabilities = Readonly<{
  connect: boolean;
  disconnect: boolean;
  refreshAuthorization: boolean;
  listBoundedMessageMetadata: boolean;
  retrieveRequiredMessageContent: boolean;
  incrementalCursor: boolean;
  providerIdentity: boolean;
  health: boolean;
  sendMail: false;
  deleteMail: false;
  modifyMailbox: false;
  accessContacts: false;
  accessCalendar: false;
}>;

export type MailboxProviderDefinition = Readonly<{
  providerId: MailboxProviderId;
  displayName: string;
  configurationStatus: "NOT_CONFIGURED";
  authorizationStatus: "UNAVAILABLE";
  minimumPermissionModel: "READ_ONLY_MINIMUM";
  capabilities: MailboxProviderCapabilities;
  limitations: readonly string[];
}>;

export type SafeProviderConnection = Readonly<{
  provider: MailboxProviderId;
  connectionId: string;
  connectedAccountLabel: string;
  grantedScopesSummary: readonly string[];
  status: ProviderConnectionStatus;
  connectedAt: string | null;
  lastHealthyAt: string | null;
  cursorMetadata: Readonly<Record<string, string>>;
  capabilityFlags: MailboxProviderCapabilities;
  revokedAt: string | null;
  errorCode: string | null;
}>;

export type ProviderOwnerContext = Readonly<{
  provider: AuthPrincipal["provider"];
  subject: string;
}>;

export function ownerContextFromPrincipal(principal: AuthPrincipal): ProviderOwnerContext {
  return Object.freeze({ provider: principal.provider, subject: principal.subject });
}

export function ownerContextKey(owner: ProviderOwnerContext): string {
  return `${owner.provider}:${owner.subject}`;
}
