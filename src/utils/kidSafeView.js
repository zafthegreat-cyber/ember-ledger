// Kid-safe view (tester reactions A48–A51, 2026-10-31).
//
// Kid Mode proper (parent-managed child profiles with approvals) is still in
// safety review. Until it ships, a profile that says it belongs to a kid gets
// a trimmed view: no business strip on Home, no prices or valuations, no
// community posting, and plain explanations of why. Nothing here changes
// what is saved; it only changes what a kid sees.

const KID_PATTERN = /(^|[^a-z])(kid|kids|child|children|minor|youth|under[_\s-]?1[0-8])(?=$|[^a-z])/i;

export function isKidSafeProfile(profile = {}, betaRequest = {}) {
  const fields = [
    profile?.accountType, profile?.account_type,
    profile?.collectorType, profile?.collector_type,
    profile?.audienceRole, profile?.audience_role,
    profile?.kidMode, profile?.kid_mode,
    betaRequest?.collectorType, betaRequest?.collector_type,
  ];
  if (profile?.kidMode === true || profile?.kid_mode === true || profile?.isKidProfile === true) return true;
  return fields.some((value) => typeof value === "string" && KID_PATTERN.test(value));
}

export const KID_SAFE_COPY = {
  postingBlocked: "Posting is turned off for kid profiles while Kid Mode is in safety review. You can still read posts and react. A parent can post from their own account.",
  pricesHidden: "Prices and values are hidden on kid profiles. A parent can see them from their account.",
  approvalPreview: "Parent approval for trades is a reminder for now, not a real approval step. Approvals are in safety review; until they ship, talk to a parent before any trade.",
  homeIntro: "Your collection, your wants, and nearby restock news. Business tools stay with a parent's account.",
};

/** Money formatter wrapper: hides amounts for kid-safe views. */
export function kidSafeMoney(formatted, kidSafeView = false) {
  return kidSafeView ? "—" : formatted;
}
