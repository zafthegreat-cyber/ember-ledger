// send-push — sends a push notification to a member's devices through
// Firebase Cloud Messaging (HTTP v1). Nov 15 2026.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   FCM_SERVICE_ACCOUNT  the Firebase service-account JSON (whole file contents)
// Callers: server-side only. The request must carry the project's service-role
// key as its bearer token (other edge functions or scheduled jobs). Members
// cannot call it directly, so nobody can push to someone else's phone.
//
// Body: { user_ids: string[], title: string, body: string, data?: Record<string,string>, url?: string }
// Tokens FCM reports as unregistered are disabled so they are not retried.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const rest = (path: string, init: RequestInit = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json", ...(init.headers ?? {}) },
});

const b64url = (input: ArrayBuffer | string) => {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let text = ""; for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

let cachedToken: { value: string; expiresAt: number } | null = null;
async function googleAccessToken(account: { client_email: string; private_key: string; token_uri?: string }) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = account.token_uri || "https://oauth2.googleapis.com/token";
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: account.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: tokenUri, iat: now, exp: now + 3600 }));
  const pem = account.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`));
  const assertion = `${header}.${claims}.${b64url(signature)}`;
  const res = await fetch(tokenUri, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error("Could not get a Firebase access token.");
  cachedToken = { value: json.access_token, expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000 };
  return cachedToken.value;
}

const clean = (value: unknown, max: number) => String(value ?? "").replace(/[\u0000-\u001f]/g, " ").slice(0, max);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!SERVICE_KEY || req.headers.get("authorization") !== `Bearer ${SERVICE_KEY}`) {
    return Response.json({ ok: false, reason: "server_only" }, { status: 403 });
  }
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT");
  if (!raw) return Response.json({ ok: false, reason: "fcm_not_configured" }, { status: 200 });
  let account: { project_id: string; client_email: string; private_key: string; token_uri?: string };
  try { account = JSON.parse(raw); } catch { return Response.json({ ok: false, reason: "fcm_secret_invalid" }, { status: 200 }); }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return Response.json({ ok: false, reason: "bad_json" }, { status: 400 }); }
  const userIds = (Array.isArray(body.user_ids) ? body.user_ids : []).map(String).filter((id) => UUID.test(id)).slice(0, 500);
  const title = clean(body.title, 120);
  const text = clean(body.body, 400);
  if (!userIds.length || !title) return Response.json({ ok: false, reason: "missing_recipients_or_title" }, { status: 400 });
  const data: Record<string, string> = {};
  if (body.data && typeof body.data === "object") for (const [k, v] of Object.entries(body.data as Record<string, unknown>).slice(0, 10)) data[clean(k, 40)] = clean(v, 300);
  if (typeof body.url === "string" && /^\/[A-Za-z0-9/_\-?=&.%]*$/.test(body.url)) data.url = body.url.slice(0, 300);

  const tokensRes = await rest(`device_push_tokens?select=id,token&disabled_at=is.null&user_id=in.(${userIds.join(",")})`);
  const tokens = tokensRes.ok ? await tokensRes.json() as { id: string; token: string }[] : [];
  if (!tokens.length) return Response.json({ ok: true, sent: 0, reason: "no_devices" }, { status: 200 });

  const accessToken = await googleAccessToken(account);
  let sent = 0; const disabled: string[] = [];
  for (const { id, token } of tokens) {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ message: { token, notification: { title, body: text }, data, android: { priority: "high", notification: { channel_id: "restocks" } } } }),
    });
    if (res.ok) { sent += 1; continue; }
    const err = await res.json().catch(() => ({}));
    const code = JSON.stringify(err);
    if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(code)) disabled.push(id);
  }
  if (disabled.length) await rest(`device_push_tokens?id=in.(${disabled.join(",")})`, { method: "PATCH", body: JSON.stringify({ disabled_at: new Date().toISOString() }) });
  return Response.json({ ok: true, sent, disabled: disabled.length }, { status: 200 });
});
