// feedback-discord — posts a quick-feedback card to a Discord channel.
// Deployed 2026-11-13 (MUST-10). Requires the secret DISCORD_FEEDBACK_WEBHOOK
// (a Discord channel webhook URL, e.g. for #app-feedback). Best effort: the
// feedback row is already saved in beta_feedback before this is called.
// No record contents, emails or tokens are forwarded — only what the member
// typed plus screen/version/device summary.
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const webhook = Deno.env.get("DISCORD_FEEDBACK_WEBHOOK");
  if (!webhook || !/^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\//.test(webhook)) {
    return Response.json({ ok: false, reason: "webhook_not_configured" }, { status: 200 });
  }
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return Response.json({ ok: false, reason: "bad_json" }, { status: 400 }); }
  const text = (value: unknown, max: number) => String(value ?? "").replace(/@(everyone|here)/g, "@​$1").slice(0, max);
  const kind = text(body.feedback_type, 40) || "Feedback";
  const severity = text(body.severity, 20);
  const color = kind === "Bug" ? 0xad2434 : kind === "Feature request" ? 0x1f7a74 : 0xd4af37;
  const device = (body.device_info && typeof body.device_info === "object") ? body.device_info as Record<string, unknown> : {};
  const payload = {
    username: "Code 3 feedback",
    allowed_mentions: { parse: [] },
    embeds: [{
      title: text(body.title, 240) || kind,
      description: text(body.description, 1800) || "(no text)",
      color,
      fields: [
        { name: "Kind", value: `${kind}${severity ? ` · ${severity}` : ""}`, inline: true },
        { name: "Screen", value: text(body.page, 100) || "unknown", inline: true },
        { name: "Version", value: text(body.app_version, 60) || "unknown", inline: true },
        { name: "Device", value: [device.viewport, device.theme, device.standalone ? "installed" : "", device.online === false ? "offline at send" : ""].filter(Boolean).map((v) => text(v, 40)).join(" · ") || "n/a", inline: false },
        { name: "Row", value: text(body.id, 60) || "n/a", inline: false },
      ],
      footer: { text: body.guest_email ? "Guest left an email (see Supabase)" : "Signed-in member" },
      timestamp: new Date().toISOString(),
    }],
  };
  const res = await fetch(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  return Response.json({ ok: res.ok, status: res.status }, { status: 200 });
});
