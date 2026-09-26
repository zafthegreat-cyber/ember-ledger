import type { MailboxProviderCapabilities, MailboxProviderDefinition, MailboxProviderId } from "./contracts";

const UNAVAILABLE_CAPABILITIES: MailboxProviderCapabilities = Object.freeze({
  connect: false,
  disconnect: false,
  refreshAuthorization: false,
  listBoundedMessageMetadata: false,
  retrieveRequiredMessageContent: false,
  incrementalCursor: false,
  providerIdentity: false,
  health: false,
  sendMail: false,
  deleteMail: false,
  modifyMailbox: false,
  accessContacts: false,
  accessCalendar: false,
});

const LIMITATIONS = Object.freeze([
  "No mailbox provider is configured.",
  "Provider authorization and message access are unavailable.",
  "Code 3 does not send, delete, or modify email.",
] as const);

const DEFINITIONS: readonly MailboxProviderDefinition[] = Object.freeze([
  Object.freeze({
    providerId: "gmail",
    displayName: "Gmail",
    configurationStatus: "NOT_CONFIGURED",
    authorizationStatus: "UNAVAILABLE",
    minimumPermissionModel: "READ_ONLY_MINIMUM",
    capabilities: UNAVAILABLE_CAPABILITIES,
    limitations: LIMITATIONS,
  }),
  Object.freeze({
    providerId: "microsoft-outlook",
    displayName: "Outlook / Microsoft",
    configurationStatus: "NOT_CONFIGURED",
    authorizationStatus: "UNAVAILABLE",
    minimumPermissionModel: "READ_ONLY_MINIMUM",
    capabilities: UNAVAILABLE_CAPABILITIES,
    limitations: LIMITATIONS,
  }),
]);

export interface MailboxProviderRegistry {
  list(): readonly MailboxProviderDefinition[];
  get(providerId: string): MailboxProviderDefinition | null;
}

export function createMailboxProviderRegistry(): MailboxProviderRegistry {
  const byId = new Map<MailboxProviderId, MailboxProviderDefinition>(DEFINITIONS.map((entry) => [entry.providerId, entry]));
  return Object.freeze({
    list: () => DEFINITIONS,
    get: (providerId: string) => byId.get(providerId as MailboxProviderId) || null,
  });
}

export const mailboxProviderRegistry = createMailboxProviderRegistry();
