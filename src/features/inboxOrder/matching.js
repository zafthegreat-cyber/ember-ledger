import { INBOX_ORDER_CONFIDENCE, INBOX_ORDER_PROVENANCE } from "./constants.js";

const EMAIL_PATTERN = /^(?=.{3,320}$)[^\s@]+@[^\s@]+$/;

function normalizedText(value) {
  return String(value || "").trim();
}

export function normalizeEmailAddress(value) {
  const address = normalizedText(value).toLowerCase();
  if (!EMAIL_PATTERN.test(address)) return null;
  const separator = address.lastIndexOf("@");
  const domain = address.slice(separator + 1);
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) return null;
  return { address, domain };
}

function activeAlias(alias) {
  return !alias?.archivedAt
    && !["ARCHIVED", "DISABLED", "ERROR"].includes(String(alias?.status || "").toUpperCase())
    && String(alias?.provisioningState || "").toUpperCase() !== "FAILED";
}

/** Exact recipient matching identifies an Account Ops relationship, not sender authenticity. */
export function matchRecipientAliases(recipients = [], context = {}) {
  const normalizedRecipients = [...new Set((recipients || [])
    .map((entry) => normalizeEmailAddress(typeof entry === "string" ? entry : entry?.address)?.address)
    .filter(Boolean))];
  const matches = [];
  for (const alias of context.aliases || []) {
    const normalizedAlias = normalizeEmailAddress(alias?.aliasAddress)?.address;
    if (!normalizedAlias || !normalizedRecipients.includes(normalizedAlias)) continue;
    const accounts = (context.storeAccounts || []).filter((account) => account?.aliasId === alias.id && !account?.archivedAt);
    matches.push({
      aliasId: alias.id,
      aliasAddress: normalizedAlias,
      profileId: alias.profileId || accounts[0]?.profileId || null,
      retailerId: alias.retailerId || accounts[0]?.retailerId || null,
      storeAccountIds: accounts.map((account) => account.id),
      usable: activeAlias(alias),
      aliasStatus: alias.status || "UNKNOWN",
      provisioningState: alias.provisioningState || "UNKNOWN",
    });
  }
  const warnings = [];
  if (matches.length > 1) warnings.push("AMBIGUOUS_ALIAS_MATCH");
  if (matches.some((match) => !match.usable)) warnings.push("ALIAS_NOT_ACTIVE_OR_PROVISIONED");
  if (matches.some((match) => match.storeAccountIds.length > 1)) warnings.push("ALIAS_LINKED_TO_MULTIPLE_ACCOUNTS");
  const selected = matches.length === 1 ? matches[0] : null;
  return Object.freeze({
    matchType: selected ? "EXACT" : (matches.length ? "AMBIGUOUS" : "NONE"),
    recipientAddresses: normalizedRecipients,
    matches,
    selected,
    confidence: selected ? INBOX_ORDER_CONFIDENCE.HIGH : (matches.length ? INBOX_ORDER_CONFIDENCE.LOW : INBOX_ORDER_CONFIDENCE.INSUFFICIENT),
    warnings,
  });
}

function senderDomainMatches(senderDomain, trustedDomain) {
  const sender = String(senderDomain || "").toLowerCase();
  const trusted = String(trustedDomain || "").toLowerCase();
  return Boolean(sender && trusted && (sender === trusted || sender.endsWith(`.${trusted}`)));
}

/** Retailer rules are trusted configuration supplied outside the message. */
export function identifyRetailer(input = {}, context = {}) {
  const sender = normalizeEmailAddress(input.sender?.address || input.sender || "");
  const aliasRetailerId = input.aliasMatch?.selected?.retailerId || null;
  const matchedRules = (context.senderRules || []).filter((rule) =>
    (rule.senderAddresses || []).some((address) => normalizeEmailAddress(address)?.address === sender?.address)
    || (rule.senderDomains || []).some((domain) => senderDomainMatches(sender?.domain, domain)));
  const trustedRetailerIds = [...new Set(matchedRules.map((rule) => rule.retailerId).filter(Boolean))];
  const evidence = [];
  const warnings = [];
  if (aliasRetailerId) evidence.push({ kind: "ALIAS_RELATIONSHIP", retailerId: aliasRetailerId, provenance: INBOX_ORDER_PROVENANCE.INFERRED });
  if (trustedRetailerIds.length === 1) evidence.push({
    kind: "TRUSTED_SENDER_RULE",
    retailerId: trustedRetailerIds[0],
    senderDomain: sender?.domain || null,
    provenance: INBOX_ORDER_PROVENANCE.PROVIDER_SUPPLIED,
  });
  if (trustedRetailerIds.length > 1) warnings.push("AMBIGUOUS_TRUSTED_SENDER_RULE");
  if (aliasRetailerId && trustedRetailerIds.length === 1 && aliasRetailerId !== trustedRetailerIds[0]) {
    warnings.push("RETAILER_ALIAS_SENDER_CONFLICT");
  }
  const proposedRetailerId = warnings.includes("RETAILER_ALIAS_SENDER_CONFLICT")
    ? null
    : (trustedRetailerIds[0] || aliasRetailerId || null);
  let confidence = INBOX_ORDER_CONFIDENCE.INSUFFICIENT;
  if (trustedRetailerIds.length === 1 && aliasRetailerId === trustedRetailerIds[0]) confidence = INBOX_ORDER_CONFIDENCE.HIGH;
  else if (trustedRetailerIds.length === 1) confidence = INBOX_ORDER_CONFIDENCE.MEDIUM;
  else if (aliasRetailerId) confidence = INBOX_ORDER_CONFIDENCE.LOW;
  if (warnings.length) confidence = INBOX_ORDER_CONFIDENCE.LOW;
  return Object.freeze({ proposedRetailerId, confidence, evidence, warnings, senderDomain: sender?.domain || null });
}
