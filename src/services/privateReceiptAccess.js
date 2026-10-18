const PRIVATE_BUCKETS = new Set(["receipts", "receipt-images", "product-submissions", "feedback-screenshots"]);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const PRIVATE_RECEIPT_URL_SECONDS = 60;
const unsafeCharacters = (value) => [...value].some((character) => character === "\\" || character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);

function cancelled(signal) {
  if (signal?.aborted) throw new DOMException("Receipt access cancelled.", "AbortError");
}

function failed() {
  return new Error("This saved file could not be opened with your current account. Sign in to an account with access, then retry.");
}

function originOf(projectUrl) {
  try {
    const url = new URL(projectUrl);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || (url.protocol !== "https:" && !(local && url.protocol === "http:"))) return "";
    return url.origin;
  } catch { return ""; }
}

// Existing records keep their original URL. Only the known project's private
// storage paths are converted, including old public links and expired tokens.
export function classifyReceiptReference(value, projectUrl, privateBuckets = PRIVATE_BUCKETS) {
  const reference = typeof value === "string" ? value.trim() : "";
  if (!reference) return { kind: "invalid" };
  if (/^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(reference)
    || /^blob:(?:https?:\/\/|capacitor:\/\/localhost\/)/i.test(reference)
    || reference.startsWith("/") && !reference.startsWith("//") && !unsafeCharacters(reference)) return { kind: "direct", url: reference };
  let url;
  try { url = new URL(reference); } catch { return { kind: "invalid" }; }
  if (url.username || url.password || !["https:", "http:"].includes(url.protocol)) return { kind: "invalid" };
  const match = url.pathname.match(/^\/storage\/v1\/object\/(public|sign|authenticated)\/([^/]+)\/(.+)$/);
  if (!match) return { kind: "direct", url: reference };
  let bucket; let path;
  try { bucket = decodeURIComponent(match[2]); path = decodeURIComponent(match[3]); } catch { return { kind: "invalid" }; }
  if (!privateBuckets.has(bucket)) return { kind: "direct", url: reference };
  if (url.origin !== originOf(projectUrl)) return { kind: "invalid" };
  if (!path || path.length > 1024 || unsafeCharacters(path)
    || path.split("/").some((part) => !part || part === "." || part === "..")) return { kind: "invalid" };
  return { kind: "private", bucket, path };
}

function bind(request, token) {
  if (typeof request?.setHeader !== "function") throw failed();
  return request.setHeader("Authorization", `Bearer ${token}`);
}

async function currentSession(client, expected, signal) {
  cancelled(signal);
  const result = await client.auth.getSession();
  cancelled(signal);
  const session = result?.data?.session;
  if (result?.error || !UUID.test(session?.user?.id || "") || !session?.access_token
    || expected && (expected.userId !== session.user.id || expected.token !== session.access_token)) throw failed();
  return { userId: session.user.id, token: session.access_token };
}

async function requireLiveSession(client, session, signal) {
  const query = bind(client.rpc("code3_current_session_valid", {}), session.token);
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  cancelled(signal);
  if (error || data !== true) throw failed();
}

export function createPrivateReceiptAccess({ client, projectUrl = client?.supabaseUrl, timeoutMs = 15_000, privateBuckets = PRIVATE_BUCKETS } = {}) {
  async function resolve(reference, { signal, expectedUserId } = {}) {
    cancelled(signal);
    const file = classifyReceiptReference(reference, projectUrl, privateBuckets);
    if (file.kind === "direct") return { url: file.url, private: false };
    if (file.kind !== "private" || !client?.auth?.getSession) throw failed();
    const session = await currentSession(client, null, signal);
    if (expectedUserId && expectedUserId !== session.userId) throw failed();
    const identity = await client.auth.getUser(session.token);
    cancelled(signal);
    if (identity.error || identity.data?.user?.id !== session.userId) throw failed();
    await requireLiveSession(client, session, signal);
    // Ownership is enforced by Storage RLS. Legacy paths are not guessed from
    // names; no record metadata, local role, or caller-supplied owner bypasses it.
    const storage = bind(client.storage.from(file.bucket), session.token);
    const signedAt = Date.now();
    const { data, error } = await storage.createSignedUrl(file.path, PRIVATE_RECEIPT_URL_SECONDS);
    cancelled(signal);
    if (error || !data?.signedUrl) throw failed();
    const signed = classifyReceiptReference(data.signedUrl, projectUrl, privateBuckets);
    const signedUrl = new URL(data.signedUrl);
    if (signed.kind !== "private" || signed.bucket !== file.bucket || signed.path !== file.path
      || !signedUrl.pathname.startsWith("/storage/v1/object/sign/") || !signedUrl.searchParams.get("token")) throw failed();
    await currentSession(client, session, signal);
    await requireLiveSession(client, session, signal);
    await currentSession(client, session, signal);
    cancelled(signal);
    return { url: data.signedUrl, private: true, ownerId: session.userId, expiresAt: signedAt + PRIVATE_RECEIPT_URL_SECONDS * 1000 };
  }

  return (reference, options = {}) => {
    const controller = new AbortController();
    return new Promise((resolveResult, reject) => {
      let settled = false;
      let timer;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abort);
        fn(value);
      };
      const abort = () => {
        controller.abort();
        finish(reject, new DOMException("Receipt access cancelled.", "AbortError"));
      };
      if (options.signal?.aborted) { abort(); return; }
      options.signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => {
        controller.abort();
        finish(reject, new Error("Receipt access took too long. Check your connection and retry."));
      }, timeoutMs);
      resolve(reference, { ...options, signal: controller.signal }).then(
        (result) => finish(resolveResult, result),
        (error) => finish(reject, error.name === "AbortError" ? error : failed()),
      );
    });
  };
}
