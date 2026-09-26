import type { MailboxProviderId, SafeProviderConnection } from "./contracts";
import type { ProviderSecretMaterial } from "./secretStore";

export type BoundedProviderMessageMetadata = Readonly<{
  providerMessageId: string;
  providerThreadId: string | null;
  senderAddress: string | null;
  recipientAddresses: readonly string[];
  subject: string;
  receivedAt: string;
  sizeEstimate: number | null;
}>;

export type BoundedProviderMessagePage = Readonly<{
  messages: readonly BoundedProviderMessageMetadata[];
  nextCursor: string | null;
}>;

/**
 * Server-only provider boundary. All live operations remain optional until a
 * provider is explicitly implemented and its advertised capability is true.
 * Raw provider credentials never appear in a client-facing connection model.
 */
export interface ServerMailboxProviderAdapter {
  readonly providerId: MailboxProviderId;
  readonly supportsAuthorizationRevocation: boolean;
  health?(input: Readonly<{
    connection: SafeProviderConnection;
    secret: ProviderSecretMaterial;
  }>): Promise<Readonly<{ healthy: boolean; checkedAt: string; errorCode: string | null }>>;
  refreshAuthorization?(input: Readonly<{
    connection: SafeProviderConnection;
    secret: ProviderSecretMaterial;
  }>): Promise<ProviderSecretMaterial>;
  listBoundedMessageMetadata?(input: Readonly<{
    connection: SafeProviderConnection;
    secret: ProviderSecretMaterial;
    cursor: string | null;
    limit: number;
  }>): Promise<BoundedProviderMessagePage>;
  retrieveRequiredMessageContent?(input: Readonly<{
    connection: SafeProviderConnection;
    secret: ProviderSecretMaterial;
    providerMessageId: string;
  }>): Promise<Readonly<{ content: unknown; discardAfterProcessing: true }>>;
  disconnect(input: Readonly<{
    connection: SafeProviderConnection;
    secret: ProviderSecretMaterial;
  }>): Promise<Readonly<{ providerAuthorizationRevoked: boolean }>>;
}
