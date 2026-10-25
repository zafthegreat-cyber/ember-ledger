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
export const PRIVACY_POLICY_UPDATED = "October 24, 2026";

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
    key: "discord-data", title: "Discord companion: information it accesses",
    body: "This policy also covers Code 3 TCG Community, our Discord bot and alert companion. When a server administrator connects it, our setup and delivery tools access the connected server's name and ID, channel names and IDs, roles and permissions, the bot's server membership, and its webhook configuration. They read recent messages in configured setup channels to find and verify the bot's welcome posts, and read back alert messages to confirm delivery. Discord can include message content, author IDs, display names, and other message metadata in these responses. Unrelated messages and author profiles are not saved by these tools. The companion does not continuously archive conversations, read private direct messages, or import your Discord friends list.",
  },
  {
    key: "discord-use", title: "Discord setup, alerts, and saved records",
    body: "We use this information to configure the authorized server, check channel access, publish welcome and help posts, deliver reviewed public alerts, confirm delivery, and prevent duplicate posts. Maintainer storage keeps server, role, channel, bot and webhook IDs, welcome-post content fingerprints, posted message IDs, delivery results, and setup timestamps. Alert duplicate protection stores a hash of the event ID and payload and the delivery receipt. Bot and webhook credentials are kept in private maintainer configuration and must never be posted publicly. This companion does not automatically link your Discord identity to your Code 3 TCG app account or copy private app records into Discord.",
  },
  {
    key: "discord-sharing", title: "What is shared with Discord and other members",
    body: "Discord receives the API requests and messages needed to operate the companion. An approved alert shares its public product, retailer or store, reported status, source, observation time, and app link in the configured channel. People with access to that channel can see, copy, or share the message. Server staff can see posts and reports allowed by their Discord permissions and may review information you send them for support or moderation. We do not sell Discord API data, disclose it to advertising networks or data brokers, use it to profile members, or use Discord message content to train AI models. Discord handles its own accounts, messages, infrastructure, and retention under its own privacy policy.",
  },
  {
    key: "discord-retention", title: "Discord retention and deletion requests",
    body: "We retain companion configuration and delivery records only while needed to operate, recover, and verify the authorized integration and prevent duplicate alerts. These maintainer records do not currently have a fixed automatic expiry. We review and delete Discord API data promptly when it is no longer needed, the integration stops operating, Discord requires deletion, or the applicable user requests deletion, unless a legal retention requirement applies. Removing the bot stops its access through that server membership; it does not by itself erase existing channel messages, webhook integrations, or records already held by Discord or other members. A server administrator can also remove the companion's webhooks in Discord's integration settings.",
  },
  {
    key: "discord-choices", title: "Your Discord privacy choices and support",
    body: "You can leave the server, change your Discord notification settings, ask staff to add or remove an optional interest role, and use Discord's controls for your own messages and account. Server administrators can remove the bot and its webhooks to disconnect it. To request access, correction, or deletion of companion data held by Code 3 TCG, or report an app or privacy concern, contact the privacy and support address on this page. Include only enough context to identify the affected server, message, or record; we may need to verify that you are entitled to the request. Never send passwords, bot tokens, webhook credentials, or private backups. Deleting your collector app account and removing a Discord integration are separate actions.",
  },
  {
    key: "discord-retailer-monitor", title: "Optional automatic retailer alerts",
    body: "When enabled, our hosted retailer monitor checks Best Buy's official Products API for supported card products and sends online-availability changes to the connected Discord server. Only the matching optional game role is mentioned. At a member's request, staff can add or remove an interest role; the setup tool checks that member's Discord ID and existing roles to confirm the change. Private monitor state contains product SKU, game, availability, transition number, timestamps, and delivery message IDs and status. It does not store retailer response bodies, customer information, or Discord conversations. Successful runs remove monitored alert messages after 24 hours and clean product and completed delivery state after 30 days. Outages or lost permissions can delay cleanup, and receipts needed to remove old messages remain until cleanup succeeds. Member copies and Discord's own records are outside this automatic cleanup. Existing setup messages and manually reviewed alerts follow the companion retention process described above.",
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
    body: "Family-program features are intended to be managed by a parent or guardian. The app does not provide public child profiles or open private messaging for children. A parent or guardian can review the information they entered and use the privacy and deletion options for their account. Do not create an account for a child without the applicable parent or guardian involvement. The Discord companion is intended only for people who meet Discord's minimum age of 13 and any higher minimum age required where they live. App family features do not allow a child below that age to use Discord. Do not submit a child's personal information to the companion or community channels; contact support if it was shared in error.",
  },
  {
    key: "changes", title: "Changes to this policy",
    body: "We update this page when our information practices change and show the current revision date above. We will provide additional notice of material changes through a reasonable available channel when practical, and request consent where required. Contact the privacy and support address on this page if you have questions about a change or an existing record.",
  },
]);
