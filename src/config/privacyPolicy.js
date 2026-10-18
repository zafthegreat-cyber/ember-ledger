// Public publisher information must be supplied by the business owner before a
// store submission. Do not infer an LLC's legal name or a monitored mailbox.
export function privacyPublisherFromEnv(env = {}) {
  const legalName = String(env.VITE_CODE3_LEGAL_ENTITY_NAME ?? "Anchor & Wing LLC DBA Code 3 TCG").trim().slice(0, 180);
  const candidate = String(env.VITE_CODE3_SUPPORT_EMAIL ?? "support@code3tcg.com").trim();
  const supportEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)
    && !/(?:example\.(?:com|org|net|invalid)|\.invalid)$/i.test(candidate)
    ? candidate : "";
  return Object.freeze({ legalName, supportEmail, ready: Boolean(legalName && supportEmail) });
}

export const PRIVACY_PUBLISHER = privacyPublisherFromEnv(import.meta.env || {});
export const PRIVACY_POLICY_UPDATED = "October 18, 2026";

export function publicPrivacyRoute(pathname = "") {
  const path = pathname.replace(/\/$/, "") || "/";
  if (["/delete-account", "/settings/delete-account"].includes(path)) return "delete";
  if (["/privacy", "/settings/privacy"].includes(path)) return "privacy";
  if (["/support", "/help"].includes(path)) return "help";
  return "";
}

export const PRIVACY_SECTIONS = Object.freeze([
  {
    key: "information", title: "Information you choose to save",
    body: "Code 3 TCG uses your account email, profile and access settings to sign you in. Depending on the tools you use, it also stores collection and wishlist records, purchases, sales, expenses, receipt details, attachments, store reports, feedback, and workspace membership. Optional family-program information is entered by a parent or guardian. Keep child names, home addresses, payment card details, and other sensitive information out of public posts and photos.",
  },
  {
    key: "purpose", title: "How information is used and shared",
    body: "Records support the features you choose: collection tracking, restock reports, business records, account recovery, and device sync. Public posts and reports can be seen by other users according to their visibility settings. Shared-workspace members can see records within their granted access. Authorized administrators may review reports, account access, family-program requests, and support submissions. Do not treat public or shared contributions as private notes.",
  },
  {
    key: "storage", title: "Device storage and cloud saving",
    body: "The app saves preferences, drafts, and some records on your device. Supabase provides account authentication, cloud database storage, and uploaded-file storage; Vercel hosts the app and its APIs. Not every local tool is included in cloud saving. Check the coverage in Settings → Cloud saving & recovery and keep verified device and cloud backups before moving to another device. A native app starts with separate storage from the website or installed web app.",
  },
  {
    key: "permissions", title: "Photos, camera, and location",
    body: "Camera, file, photo, and location access is used when you choose a related feature, such as scanning a barcode, attaching a receipt, or finding nearby stores. You can decline or revoke device permissions and use manual entry where available. Reports identify stores; do not include your private location or another person's private details in a report. External maps, retailers, and image providers receive normal network information when their content is requested and apply their own policies.",
  },
  {
    key: "mailbox", title: "Optional purchase-email import",
    body: "The protected purchase-email tool uses the mailbox address and app password you enter for one read-only connection to your chosen supported email provider. The app password is sent over an encrypted connection, used in memory for that request, and is not saved by Code 3 TCG. The importer does not send mail or mark messages as read. Extracted purchase details are presented for review before you save drafts; it does not import your whole inbox into app records. You can revoke the app password with your email provider.",
  },
  {
    key: "security", title: "Operational information",
    body: "Hosting and account services process network and security information needed to serve requests and protect access. Account sessions and selected app actions may have security or activity records. Do not send passwords, app passwords, license keys, or payment details in feedback. Your provider's account password is entered only in the appropriate sign-in or confirmation field.",
  },
  {
    key: "rights", title: "Export, correction, and account deletion",
    body: "You can edit supported records and download available device and cloud backups from Settings. The Delete account page lets you review the current deletion scope, confirm your password, and permanently delete your account when the service is available. Shared workspace or protected service ownership must be transferred before deletion so another person's records are not removed. A privacy request saved in the app is not confirmation of account deletion.",
  },
  {
    key: "retention", title: "What remains after account deletion",
    body: "The deletion review lists the account data and files the service will remove and any retained scope before you confirm. A successful cloud deletion does not erase backups you downloaded, copies held by other people, or device-only records on your other devices. Device copies remain linked to the original account and are not assigned to a new account automatically. Administrative actions on shared records may remain without your account reference. Contact support with questions about a specific record or deletion request.",
  },
  {
    // Verified production plan/settings on October 18, 2026. Plan access windows
    // are not proof of a provider-wide permanent-erasure deadline.
    // https://supabase.com/docs/guides/platform/backups
    key: "provider-backups", title: "Database recovery backups",
    body: "Supabase creates daily backups of our database for recovery. Our current plan has a documented seven-day window for accessing those backups. Backups can contain records saved before account deletion. They include uploaded-file metadata, but not the uploaded files themselves. The backup access window is not a promise that every provider-held copy is permanently erased within seven days.",
  },
  {
    // Actual plans: Supabase Pro, Vercel Hobby; no configured provider log drains.
    // https://supabase.com/pricing
    // https://vercel.com/docs/logs/runtime
    // https://vercel.com/docs/limits#logs
    // Provider-internal retention and effective purge schedules remain a rollout
    // review item; do not turn these documented viewing windows into deadlines.
    key: "provider-logs", title: "Service logs",
    body: "For the plans we currently use, Supabase documents seven days of access to API, database, and authentication logs. Vercel documents one hour of runtime logs, which record requests while the app runs. Its build logs, which record how an app release was prepared, are separate and are stored indefinitely for each deployment. We have not configured continuous log exports through either provider. Provider security, support, and infrastructure records can follow separate retention rules. These viewing windows are not a complete deletion schedule; contact support about a specific record or request.",
  },
  {
    key: "children", title: "Family information",
    body: "Family-program features are intended to be managed by a parent or guardian. The app does not provide public child profiles or open private messaging for children. A parent or guardian can review the information they entered and use the privacy and deletion options for their account. Do not create an account for a child without the applicable parent or guardian involvement.",
  },
]);
