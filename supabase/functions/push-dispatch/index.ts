// push-dispatch — drains public.push_outbox through send-push (Nov 15, 2026).
//
// Called every minute by pg_cron (only when something is queued). It takes no
// input and can only send what the database already queued, so it needs no
// caller authentication: calling it early just sends queued alerts sooner.
// It uses the service-role key it is given by Supabase to claim rows and to call
// send-push, which only accepts that key.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const headers = { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json" };
const rpc = (name: string, args: Record<string, unknown>) =>
  fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: "POST", headers, body: JSON.stringify(args) });

type OutboxRow = { id: string; user_ids: string[]; title: string; body: string; url: string | null; kind: string };

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!SUPABASE_URL || !SERVICE_KEY) return Response.json({ ok: false, reason: "not_configured" }, { status: 500 });

  const claimed = await rpc("claim_push_outbox", { p_limit: 20 });
  if (!claimed.ok) return Response.json({ ok: false, reason: "claim_failed" }, { status: 500 });
  const rows = await claimed.json() as OutboxRow[];
  let sent = 0;
  for (const row of rows) {
    let result = "error";
    let done = false;
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
        method: "POST",
        headers,
        body: JSON.stringify({ user_ids: row.user_ids, title: row.title, body: row.body, url: row.url ?? undefined, data: { kind: row.kind } }),
      });
      const json = await res.json().catch(() => ({})) as { ok?: boolean; sent?: number; reason?: string };
      result = json.reason ?? (json.ok ? `sent ${json.sent ?? 0}` : `http ${res.status}`);
      // "no_devices" is final; "push_not_configured" and errors are retried (up to 3 attempts).
      done = Boolean(json.ok);
      if (done) sent += json.sent ?? 0;
    } catch (error) {
      result = String((error as Error)?.message ?? error);
    }
    await rpc("finish_push_outbox", { p_id: row.id, p_sent: done, p_result: result });
  }
  return Response.json({ ok: true, claimed: rows.length, sent });
});
