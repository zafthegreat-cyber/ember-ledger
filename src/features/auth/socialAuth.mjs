export const SOCIAL_PROVIDERS = Object.freeze([
  { id: "google", name: "Google" }, { id: "apple", name: "Apple" },
  { id: "discord", name: "Discord" }, { id: "facebook", name: "Facebook" },
]);
export const SOCIAL_INTENT_KEY = "code3.social-sign-in.v1";
const providerIds = new Set(SOCIAL_PROVIDERS.map(provider => provider.id));
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MAX_AGE = 15 * 60_000;
const failure = () => new Error("This sign-in could not be verified. Return to Code 3 TCG and try again. Your saved records have not been moved.");

export function releasedProviders(value = "") {
  return [...new Set(String(value).split(",").map(id => id.trim()).filter(id => providerIds.has(id)))];
}

export function webSocialRedirect(origin, development = false) {
  const url = new URL(origin);
  const production = url.origin === "https://code3tcg.app";
  const local = development && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((!production && !local) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw failure();
  return `${url.origin}/auth/callback`;
}

export function parseSocialCallback(value, expectedOrigin) {
  let url;
  try { url = new URL(value); } catch { throw failure(); }
  if (url.origin !== expectedOrigin || url.pathname !== "/auth/callback" || url.username || url.password || url.hash) throw failure();
  const keys = [...url.searchParams.keys()];
  if (keys.length !== new Set(keys).size || keys.some(key => !["code", "error", "error_code", "error_description"].includes(key))) throw failure();
  if (url.searchParams.has("error")) return { error: true };
  const code = url.searchParams.get("code") || "";
  if (!/^[A-Za-z0-9_-]{20,256}$/.test(code)) throw failure();
  return { code, error: false };
}

function checkedAuthOrigin(projectUrl) {
  const url = new URL(projectUrl);
  if (url.protocol !== "https:" || !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname) || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) throw failure();
  return url.origin;
}

export function checkedProviderUrl(value, provider, projectUrl) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || !providerIds.has(provider)) throw failure();
  const supabase = url.origin === checkedAuthOrigin(projectUrl) && ["/auth/v1/authorize", "/auth/v1/user/identities/authorize"].includes(url.pathname);
  const destinations = {
    google: url.hostname === "accounts.google.com" && /^\/o\/oauth2\/(?:v2\/)?auth$/.test(url.pathname),
    apple: url.hostname === "appleid.apple.com" && url.pathname === "/auth/authorize",
    discord: url.hostname === "discord.com" && /^\/(?:api\/)?oauth2\/authorize$/.test(url.pathname),
    facebook: ["www.facebook.com", "facebook.com"].includes(url.hostname) && /^\/(?:v[0-9.]+\/)?dialog\/oauth$/.test(url.pathname),
  };
  if (!supabase && !destinations[provider]) throw failure();
  return url.href;
}

export async function loadSocialAvailability({ projectUrl, publicKey, released = [], fetchImpl = fetch, signal }) {
  if (!publicKey || !released.length) return [];
  const origin = checkedAuthOrigin(projectUrl);
  const response = await fetchImpl(`${origin}/auth/v1/settings`, {
    headers: { apikey: publicKey }, redirect: "error", cache: "no-store",
    signal: signal || AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Sign-in options are temporarily unavailable. You can still use email and password.");
  const settings = await response.json();
  return SOCIAL_PROVIDERS.filter(provider => released.includes(provider.id) && settings.external?.[provider.id] === true);
}

const completedClients = new WeakMap();
export function createSocialAuthService({ client, oauthClient, clearOAuthStorage = async () => {}, projectUrl, store, loadAvailability, launch, origin,
  native = false, development = false, linkingEnabled = false, now = () => Date.now() }) {
  async function verifiedUser(expectedId, target = client) {
    const before = await target.auth.getSession();
    const token = before.data?.session?.access_token;
    if (before.error || !token) throw failure();
    const { data, error } = await target.auth.getUser(token);
    if (error || !data?.user?.id || data.user.is_anonymous || expectedId && data.user.id !== expectedId) throw failure();
    const request = target.rpc("code3_current_session_valid");
    if (typeof request.setHeader !== "function") throw failure();
    const validity = await request.setHeader("Authorization", `Bearer ${token}`);
    if (validity.error || validity.data !== true) throw failure();
    const after = await target.auth.getSession();
    if (after.error || after.data?.session?.access_token !== token) throw failure();
    return data.user;
  }
  async function clear() { await store.removeItem(SOCIAL_INTENT_KEY); }
  return {
    async start(provider, { mode = "signin", userId } = {}) {
      if (!client || !oauthClient || !providerIds.has(provider) || !["signin", "link"].includes(mode)) throw failure();
      if (!(await loadAvailability()).some(item => item.id === provider)) throw new Error("This sign-in option is not available yet. Use email and password.");
      if (mode === "link") {
        if (!linkingEnabled || !idPattern.test(userId || "")) throw new Error("Connecting sign-in methods is not available yet.");
        await verifiedUser(userId);
        const original = await client.auth.getSession();
        if (original.data?.session?.user?.id !== userId) throw failure();
        const adopted = await oauthClient.auth.setSession({ access_token: original.data.session.access_token, refresh_token: original.data.session.refresh_token });
        if (adopted.error) throw failure();
        await verifiedUser(userId, oauthClient);
      } else {
        const session = await client.auth.getSession();
        if (session.error || session.data?.session) throw new Error("You are already signed in. Connect another sign-in method from account settings.");
      }
      const redirectTo = native ? "code3tcg://auth/callback?flow=oauth" : webSocialRedirect(origin, development);
      // This receipt contains no email, password, authorization code or token.
      // Native receipts use the same encrypted storage as the native session.
      const intent = { provider, mode, userId: mode === "link" ? userId : null, issuedAt: now(), origin: native ? "native" : origin };
      await store.setItem(SOCIAL_INTENT_KEY, JSON.stringify(intent));
      let redirecting = false;
      try {
        const options = { redirectTo, skipBrowserRedirect: true };
        if (provider === "google") options.queryParams = { prompt: "select_account" };
        if (provider === "discord") options.scopes = "identify email";
        if (provider === "facebook") options.scopes = "email";
        const request = { provider, options };
        const result = await (mode === "link" ? oauthClient.auth.linkIdentity(request) : oauthClient.auth.signInWithOAuth(request));
        if (result.error || !result.data?.url) throw failure();
        await launch(checkedProviderUrl(result.data.url, provider, projectUrl));
        redirecting = true;
      } catch { throw failure(); }
      finally { if (!redirecting) { await clear(); await clearOAuthStorage(); } }
    },
    async finish(callback) {
      if (!client || !oauthClient) throw failure();
      let states = completedClients.get(client);
      if (!states) { states = new Map(); completedClients.set(client, states); }
      // Single-use code exchanges must also be single-use across React remounts.
      const key = callback.code || "denied";
      if (states.has(key)) return states.get(key).then(async result => { await verifiedUser(result.userId); return result; });
      const result = (async () => {
        let adopted = false;
        try {
          const intent = JSON.parse(await store.getItem(SOCIAL_INTENT_KEY) || "null");
          if (!intent || !providerIds.has(intent.provider) || !["signin", "link"].includes(intent.mode)
            || !Number.isFinite(intent.issuedAt) || now() - intent.issuedAt > MAX_AGE || now() < intent.issuedAt
            || intent.origin !== (native ? "native" : origin) || intent.mode === "link" && (!linkingEnabled || !idPattern.test(intent.userId || ""))) throw failure();
          if (callback.error || !/^[A-Za-z0-9_-]{20,256}$/.test(callback.code || "")) throw failure();
          const response = await oauthClient.auth.exchangeCodeForSession(callback.code);
          if (response.error || !response.data?.user?.id || !response.data?.session?.access_token || !response.data.session.refresh_token) throw failure();
          const user = await verifiedUser(intent.mode === "link" ? intent.userId : response.data.user.id, oauthClient);
          if (!user.identities?.some(identity => identity.provider === intent.provider)) throw failure();
          if (intent.mode === "link") await verifiedUser(intent.userId);
          else {
            const current = await client.auth.getSession();
            if (current.error || current.data?.session) throw failure();
          }
          const accepted = await client.auth.setSession({ access_token: response.data.session.access_token, refresh_token: response.data.session.refresh_token });
          if (accepted.error) throw failure();
          adopted = true;
          await verifiedUser(user.id);
          return { path: intent.mode === "link" ? "/settings" : "/find/home", userId: user.id };
        } catch {
          if (adopted) await client.auth.signOut({ scope: "local" }).catch(() => {});
          throw failure();
        } finally { await clear(); await clearOAuthStorage(); }
      })();
      states.set(key, result);
      if (states.size > 20) states.delete(states.keys().next().value);
      return result;
    },
    verifiedUser,
  };
}
