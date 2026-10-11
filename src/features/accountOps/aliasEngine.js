import {
  ACCOUNT_OPS_LIMITS,
  ACCOUNT_OPS_PROVENANCE,
  ALIAS_PROVISIONING_STATES,
  EMAIL_ALIAS_STATUSES,
  VERIFICATION_STATES,
} from "./constants.js";
import { secureRandomString } from "./secureRandom.js";
import { AccountOpsValidationError, validateDomainName, validateEmailLocalPart } from "./validators.js";

export const DEFAULT_ALIAS_TEMPLATE = "{store}-{profile}-{random}";
export const ALIAS_TEMPLATE_TOKENS = Object.freeze(["store", "profile", "random", "sequence"]);
const RANDOM_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function slug(value, fallback) {
  const normalized = String(value || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  return normalized || fallback;
}

export function validateAliasTemplate(value) {
  const template = String(value || DEFAULT_ALIAS_TEMPLATE).trim();
  if (!template || template.length > 120) throw new AccountOpsValidationError("INVALID_ALIAS_TEMPLATE", "Alias template is empty or too long.");
  const tokens = [...template.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
  const unknown = tokens.filter((token) => !ALIAS_TEMPLATE_TOKENS.includes(token));
  if (unknown.length || /[{}]/.test(template.replace(/\{(?:store|profile|random|sequence)\}/g, ""))) {
    throw new AccountOpsValidationError("UNKNOWN_ALIAS_TOKEN", "Alias template contains an unsupported token.", { tokens: unknown });
  }
  if (!tokens.length) throw new AccountOpsValidationError("ALIAS_TOKEN_REQUIRED", "Alias templates must include at least one supported token.");
  return template;
}

function existingAddresses(aliases = []) {
  return new Set((Array.isArray(aliases) ? aliases : []).map((alias) => String(alias?.aliasAddress || "").trim().toLowerCase()).filter(Boolean));
}

export function generateEmailAlias(options = {}) {
  const domainRecord = options.domainRecord || {};
  const domain = validateDomainName(options.domain || domainRecord.domain);
  const template = validateAliasTemplate(options.template || DEFAULT_ALIAS_TEMPLATE);
  const used = existingAddresses(options.existingAliases);
  let sequence = Number.isInteger(options.sequence) && options.sequence > 0 ? options.sequence : used.size + 1;
  const hasUniquenessToken = /\{(?:random|sequence)\}/.test(template);

  for (let attempt = 0; attempt < ACCOUNT_OPS_LIMITS.maximumAliasAttempts; attempt += 1) {
    const random = secureRandomString(Number(options.randomLength || 6), RANDOM_ALPHABET, options.randomSource);
    const tokens = {
      store: slug(options.retailer?.displayName, "store"),
      profile: slug(options.profile?.aliasLabel || options.profile?.displayName, "profile"),
      random,
      sequence: String(sequence),
    };
    let localPart = template.replace(/\{(store|profile|random|sequence)\}/g, (_, token) => tokens[token]);
    if (!hasUniquenessToken) localPart = `${localPart}-${random}`;
    localPart = localPart.replace(/[^a-z0-9!#$%&'*+\-/=?^_`{|}~.]+/gi, "-").replace(/-{2,}/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 64);
    localPart = validateEmailLocalPart(localPart);
    const aliasAddress = `${localPart}@${domain}`;
    if (!used.has(aliasAddress)) {
      return Object.freeze({
        aliasAddress,
        domain,
        localPart,
        domainId: String(domainRecord.id || options.domainId || ""),
        profileId: options.profile?.id || options.profileId || null,
        retailerId: options.retailer?.id || options.retailerId || null,
        purpose: String(options.purpose || "").trim(),
        status: EMAIL_ALIAS_STATUSES.PENDING,
        provisioningState: ALIAS_PROVISIONING_STATES.GENERATED_LOCAL,
        verificationState: VERIFICATION_STATES.UNKNOWN,
        provider: domainRecord.providerId || "LOCAL_METADATA_ONLY",
        providerExternalId: "",
        forwardingDestinationMetadata: {},
        provenance: ACCOUNT_OPS_PROVENANCE.GENERATED_LOCAL,
        notes: "",
      });
    }
    sequence += 1;
  }
  throw new AccountOpsValidationError("ALIAS_COLLISION_LIMIT", "A unique alias could not be generated within the bounded attempt limit.");
}
