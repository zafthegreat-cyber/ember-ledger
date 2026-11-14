// feedback-discord — posts a quick-feedback card to a Discord channel.
// Deployed 2026-11-13 (MUST-10); hardened 2026-11-14 (audit).
//
// Requires the secret DISCORD_FEEDBACK_WEBHOOK (a Discord channel webhook URL).
// The caller sends only { id }. This function loads that row from beta_feedback
// with the service role and posts it only if:
//   * the row exists and was saved in the last 10 minutes,
//   * it has not been posted before (discord_posted_at is claimed atomically),
//   * fewer than 30 rows were posted in the last 10 minutes (overall cap).
// So nothing reaches Discord unless it was stored first, each row posts once,
// and links are defanged. No emails, tokens or record contents are forwarded.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WINDOW_MINUTES = 10;
const MAX_POSTS_PER_WINDOW = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const rest = (path: string, init: RequestInit = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json", ...(init.headers ?? {}) },
});

// Plain text only: no mass mentions, and links shown as text that does not open.
const text = (value: unknown, max: number) => String(value ?? "")
  .replace(/@(everyone|here)/gi, "@​$1")
  .replace(/<@[!&]?\d+>/g, "[mention]")
  .replace(/\b(https?):\/\//gi, "$1[:]//")
  .replace(/\bwww\./gi, "www[.]")
  .slice(0, max);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const webhook = Deno.env.get("DISCORD_FEEDBACK_WEBHOOK");
  if (!webhook || !/^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\//.test(webhook)) {
    return Response.json({ ok: false, reason: "webhook_not_configured" }, { status: 200 });
  }
  if (!SUPABASE_URL || !SERVICE_KEY) return Response.json({ ok: false, reason: "not_configured" }, { status: 200 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return Response.json({ ok: false, reason: "bad_json" }, { status: 400 }); }
  const id = String(body.id ?? "");
  if (!UUID.test(id)) return Response.json({ ok: false, reason: "bad_id" }, { status: 400 });

  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();

  // Overall cap: how many rows were posted in the window.
  const countRes = await rest(`beta_feedback?select=id&discord_posted_at=gte.${encodeURIComponent(since)}`, { headers: { prefer: "count=exact", range: "0-0" } });
  const posted = Number((countRes.headers.get("content-range") ?? "").split("/")[1] ?? "0");
  if (!countRes.ok || !Number.isFinite(posted)) return Response.json({ ok: false, reason: "count_failed" }, { status: 200 });
  if (posted >= MAX_POSTS_PER_WINDOW) return Response.json({ ok: false, reason: "rate_limited" }, { status: 200 });

  // Claim the row: only a fresh, never-posted row is returned, so each row posts once.
  const claim = await rest(
    `beta_feedback?id=eq.${id}&discord_posted_at=is.null&created_at=gte.${encodeURIComponent(since)}&select=id,user_id,guest_email,feedback_type,page,title,description,severity,app_version,device_info`,
    { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify({ discord_posted_at: new Date().toISOString() }) },
  );
  const rows = claim.ok ? await claim.json().catch(() => []) : [];
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return Response.json({ ok: false, reason: "not_found_or_already_posted" }, { status: 200 });

  const kind = text(row.feedback_type, 40) || "Feedback";
  const severity = text(row.severity, 20);
  const color = kind === "Bug" ? 0xad2434 : kind === "Feature request" ? 0x1f7a74 : 0xd4af37;
  const device = (row.device_info && typeof row.device_info === "object") ? row.device_info as Record<string, unknown> : {};
  const payload = {
    username: "Code 3 feedback",
    allowed_mentions: { parse: [] },
    embeds: [{
      title: text(row.title, 240) || kind,
      description: text(row.description, 1800) || "(no text)",
      color,
      fields: [
        { name: "Kind", value: `${kind}${severity ? ` · ${severity}` : ""}`, inline: true },
        { name: "Screen", value: text(row.page, 100) || "unknown", inline: true },
        { name: "Version", value: text(row.app_version, 60) || "unknown", inline: true },
        { name: "Device", value: [device.viewport, device.theme, device.standalone ? "installed" : "", device.online === false ? "offline at send" : ""].filter(Boolean).map((v) => text(v, 40)).join(" · ") || "n/a", inline: false },
        { name: "Row", value: id, inline: false },
      ],
      footer: { text: row.user_id ? "Signed-in member" : row.guest_email ? "Guest left an email (see Supabase)" : "Guest" },
      timestamp: new Date().toISOString(),
    }],
  };
  const res = await fetch(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  return Response.json({ ok: res.ok, status: res.status }, { status: 200 });
});
