import { ALIAS_PROVISIONING_STATES, EMAIL_DOMAIN_MODES } from "./constants.js";
import { assertSafeAccountOpsInput } from "./security.js";

export const EMAIL_PROVIDER_CAPABILITY = Object.freeze({
  LOCAL_METADATA_ONLY: "LOCAL_METADATA_ONLY",
  OWNER_CONFIRMED_CATCH_ALL: "OWNER_CONFIRMED_CATCH_ALL",
  PROVIDER_MANAGED: "PROVIDER_MANAGED",
});

function unavailable(operation, capability, detail) {
  return async () => ({
    ok: false,
    operation,
    capability,
    provisioningState: ALIAS_PROVISIONING_STATES.GENERATED_LOCAL,
    receivingMail: false,
    ownerConfirmationRequired: true,
    detail,
  });
}

export function createEmailProviderAdapter(options = {}) {
  assertSafeAccountOpsInput(options);
  const providerId = String(options.providerId || "local-metadata").trim();
  const displayName = String(options.displayName || "Local alias metadata").trim();
  const mode = Object.values(EMAIL_DOMAIN_MODES).includes(options.mode) ? options.mode : EMAIL_DOMAIN_MODES.LOCAL_METADATA_ONLY;
  const capability = mode === EMAIL_DOMAIN_MODES.PROVIDER_MANAGED
    ? EMAIL_PROVIDER_CAPABILITY.PROVIDER_MANAGED
    : mode === EMAIL_DOMAIN_MODES.CATCH_ALL
      ? EMAIL_PROVIDER_CAPABILITY.OWNER_CONFIRMED_CATCH_ALL
      : EMAIL_PROVIDER_CAPABILITY.LOCAL_METADATA_ONLY;
  const detail = mode === EMAIL_DOMAIN_MODES.CATCH_ALL
    ? "Code 3 stores catch-all metadata. The owner must confirm that delivery works."
    : mode === EMAIL_DOMAIN_MODES.PROVIDER_MANAGED
      ? "No provider-managed alias connector is configured in Phase 2A."
      : "The address is generated metadata only and is not provisioned or receiving mail.";
  return Object.freeze({
    providerId,
    displayName,
    mode,
    capability,
    provisioned: false,
    receivingMail: false,
    detail,
    createAlias: unavailable("createAlias", capability, detail),
    disableAlias: unavailable("disableAlias", capability, detail),
    checkAlias: unavailable("checkAlias", capability, detail),
    routeAlias: unavailable("routeAlias", capability, detail),
    listMessages: unavailable("listMessages", capability, "Inbox access is a future, separately authorized integration."),
  });
}

export const LOCAL_EMAIL_METADATA_PROVIDER = createEmailProviderAdapter({
  providerId: "local-metadata",
  displayName: "Local alias metadata",
  mode: EMAIL_DOMAIN_MODES.LOCAL_METADATA_ONLY,
});

export function emailProviderForDomain(domain = {}) {
  return createEmailProviderAdapter({
    providerId: domain.providerId || (domain.mode === EMAIL_DOMAIN_MODES.CATCH_ALL ? "owner-catch-all" : "local-metadata"),
    displayName: domain.mode === EMAIL_DOMAIN_MODES.CATCH_ALL ? "Owner-confirmed catch-all" : "Local alias metadata",
    mode: domain.mode,
  });
}
