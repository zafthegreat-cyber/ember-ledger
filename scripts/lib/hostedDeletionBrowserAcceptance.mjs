import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { assertAuthorizedHttpsTestConfig, isolatedProviderConfig, previewAccessHeaders } from "./hostedDeletionHttpsGuard.mjs";
import { assertSyntheticPaths, TEST_BUCKETS } from "./hostedDeletionGuard.mjs";

const require = createRequire(import.meta.url);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const EMAIL = /^code3-delete-([a-f0-9-]{36})-([a-z]{1,20})@example\.test$/;
const PRESERVE_KEY = "code3-https-acceptance-preserve";
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

// The runner owns account creation, privileged verification and cleanup. This
// adapter accepts only issued Preview configuration and this run's in-memory
// synthetic logins. Importing it never launches a browser or makes requests.
export function validateHostedDeletionBrowserInput(input) {
  assertAuthorizedHttpsTestConfig(input?.guardedConfig);
  const config = input.guardedConfig;
  const provider = isolatedProviderConfig(config);
  assert.ok(config.execute && config.withBrowser, "Browser acceptance requires explicit isolated execution");
  assert.equal(input.appOrigin, config.appOrigin, "The browser must use the pinned Preview origin");
  assert.equal(input.projectRef, config.projectRef, "The browser must use the isolated project");
  // Boolean assertion prevents a mistakenly supplied server key appearing in
  // an assertion's actual/expected diff.
  assert.ok(input.publicAnonKey === provider.anon, "Only the isolated public key may enter the browser");
  assert.equal(typeof input.assertFixture, "function", "A server-owned synthetic-fixture verifier is required");
  assert.equal(typeof input.reportCheck, "function", "A sanitized result recorder is required");
  const runIds = [];
  for (const [kind, fixture] of [["browser", input.browserFixture], ["sentinel", input.sentinel]]) {
    const email = typeof fixture?.email === "string" && fixture.email.match(EMAIL);
    assert.ok(email && UUID.test(email[1]) && email[2] === kind && UUID.test(fixture.id || ""), "Only this run's expected synthetic accounts may be used");
    assert.ok(typeof fixture.password === "string" && fixture.password.length >= 16 && fixture.password.length <= 1024, "A generated synthetic password is required");
    assert.ok(Array.isArray(fixture.attachments) && fixture.attachments.length === TEST_BUCKETS.length, "The complete synthetic attachment manifest is required");
    assert.equal(new Set(fixture.attachments.map(file => file.bucket)).size, TEST_BUCKETS.length, "Synthetic attachment buckets must be distinct");
    for (const file of fixture.attachments) {
      assertSyntheticPaths(file.bucket, [file.path], [fixture], email[1]);
      const url = new URL(file.reference);
      assert.equal(url.origin, provider.origin, "Private references cannot leave the isolated provider");
      assert.ok(!url.username && !url.password && !url.search && !url.hash, "Synthetic legacy references have no embedded credentials");
      assert.equal(decodeURIComponent(url.pathname), `/storage/v1/object/public/${file.bucket}/${file.path}`, "The exact synthetic public reference must be retained");
    }
    runIds.push(email[1]);
  }
  assert.equal(runIds[0], runIds[1], "Both accounts must belong to the same synthetic run");
  assert.notEqual(input.browserFixture.id, input.sentinel.id, "Owner and sentinel must be different accounts");
  return Object.freeze({ appOrigin: config.appOrigin, providerOrigin: provider.origin, runId: runIds[0] });
}

export function browserRequestAllowed({ appOrigin, providerOrigin, fixturePath, attachments }, input, method = "GET") {
  let url;
  try { url = new URL(input); } catch { return false; }
  if (url.username || url.password || url.hash || url.protocol !== "https:") return false;
  const verb = method.toUpperCase();
  if (url.origin === appOrigin) {
    if (url.pathname === fixturePath) return verb === "GET" && !url.search;
    if (url.pathname.startsWith("/api/")) return !url.search && (
      url.pathname === "/api/account/deletion/status" && ["GET", "OPTIONS"].includes(verb)
      || url.pathname === "/api/account/deletion" && ["POST", "OPTIONS"].includes(verb));
    return ["GET", "HEAD"].includes(verb) && !url.search && (
      ["/delete-account", "/privacy", "/support", "/app-version.json", "/manifest.webmanifest", "/favicon.ico"].includes(url.pathname)
      || url.pathname.startsWith("/assets/") || url.pathname.startsWith("/fonts/"));
  }
  if (url.origin !== providerOrigin) return false;
  if (url.pathname === "/auth/v1/token") return ["POST", "OPTIONS"].includes(verb)
    && [...url.searchParams.keys()].length === 1 && ["password", "refresh_token"].includes(url.searchParams.get("grant_type"));
  if (url.pathname === "/auth/v1/user" || url.pathname === "/auth/v1/settings") return ["GET", "OPTIONS"].includes(verb) && !url.search;
  // Never revoke the runner's independent session or another browser account.
  if (url.pathname === "/auth/v1/logout") return ["POST", "OPTIONS"].includes(verb)
    && [...url.searchParams.keys()].length === 1 && url.searchParams.get("scope") === "local";
  if (url.pathname === "/rest/v1/rpc/code3_current_session_valid") return ["POST", "OPTIONS"].includes(verb) && !url.search;
  const match = url.pathname.match(/^\/storage\/v1\/object\/(public|sign)\/([^/]+)\/(.+)$/);
  if (!match) return false;
  let bucket, path;
  try { bucket = decodeURIComponent(match[2]); path = decodeURIComponent(match[3]); } catch { return false; }
  if (!attachments.some(file => file.bucket === bucket && file.path === path)) return false;
  return match[1] === "public" ? ["GET", "HEAD", "OPTIONS"].includes(verb)
    : ["GET", "HEAD", "POST", "OPTIONS"].includes(verb);
}

export function signedAttachmentInfo(value, providerOrigin, file) {
  try {
    const url = new URL(value);
    if (url.origin !== providerOrigin || url.username || url.password || url.hash
      || decodeURIComponent(url.pathname) !== `/storage/v1/object/sign/${file.bucket}/${file.path}`
      || url.searchParams.getAll("token").length !== 1) return null;
    const token = url.searchParams.get("token");
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    // Decode a token received from the actual signer solely for test identity
    // and deadline checks. Supabase, not these unverified claims, grants access.
    const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(globalThis.atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")));
    if (claims.url !== `${file.bucket}/${file.path}` || !Number.isSafeInteger(claims.exp) || claims.exp <= 0) return null;
    return { url: url.href, bucket: file.bucket, path: file.path, expiresAt: claims.exp * 1000 };
  } catch { return null; }
}

export function isExpiredStorageResponse(status, body) {
  if (![400, 401, 403].includes(status) || !body || typeof body !== "object") return false;
  const code = String(body.code || body.error || "");
  if (code === "ExpiredToken") return true;
  const message = String(body.message || "");
  // Current Storage wraps jose's exact exp-claim error in InvalidJWT; older
  // deployments return "jwt expired". Neither generic InvalidJWT nor a request
  // validation/permission failure proves that a previously valid token expired.
  return code === "InvalidJWT" && (/\b(?:jwt|token|signature)\b.*\bexpir(?:ed|ation)\b/i.test(message)
    || /^"exp" claim timestamp check failed$/i.test(message));
}

export function completedRenewalBeforeExpiry(previous, next, completedAt) {
  return Boolean(previous && next && previous.url !== next.url && previous.bucket === next.bucket && previous.path === next.path
    && next.expiresAt > previous.expiresAt && Number.isFinite(completedAt) && completedAt < previous.expiresAt);
}

export async function probeRevokedAttachmentSigners({ files, provider, headers, request, denied }) {
  const results = [];
  for (const file of files) {
    const response = await request(`${provider}/storage/v1/object/sign/${file.bucket}/${file.path}`, {
      method: "POST", headers, body: JSON.stringify({ expiresIn: 60 }),
    });
    results.push({ bucket: file.bucket, denied: await denied(response) });
  }
  return results;
}

export function browserEnvironment(environment = process.env) {
  // Chromium must not inherit the runner's privileged provider/test variables.
  const allowed = new Set(["PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "TMPDIR", "LOCALAPPDATA", "APPDATA", "USERPROFILE", "HOME", "DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR", "LANG", "LC_ALL", "TZ", "PLAYWRIGHT_BROWSERS_PATH", "FONTCONFIG_PATH", "FONTCONFIG_FILE"]);
  return Object.fromEntries(Object.entries(environment).filter(([key]) => allowed.has(key.toUpperCase())));
}

export async function forwardProtectedPreviewResponse({ route, guardedConfig, scope }) {
  assertAuthorizedHttpsTestConfig(guardedConfig);
  assert.equal(scope.appOrigin, guardedConfig.appOrigin, "Preview forwarding requires the approved application origin");
  const request = route.request();
  assert.ok(browserRequestAllowed(scope, request.url(), request.method()), "Preview forwarding cannot bypass the destination guard");
  const access = previewAccessHeaders(guardedConfig, request.url(), request.method());
  if (!Object.keys(access).length) return false;
  // route.continue header overrides survive redirects. Fetch exactly one real
  // response instead, reject every redirect, then forward the unchanged bytes
  // and headers. The temporary OIDC header never reaches another origin.
  const response = await route.fetch({ headers: { ...request.headers(), ...access }, maxRedirects: 0, timeout: 45_000 });
  if (response.status() >= 300 && response.status() < 400) {
    await response.dispose().catch(() => undefined);
    throw new Error("Protected Preview redirects are forbidden");
  }
  await route.fulfill({ response });
  return true;
}

export async function buildReceiptComponentFixtureHtml({ providerOrigin, publicAnonKey, attachments }) {
  const { build } = require("esbuild");
  // Bundle the actual source components/client without module substitutions.
  // The HTML alone is intercepted at a synthetic path in the approved origin;
  // every Auth/RPC/signing/image request goes to the real isolated provider.
  const source = `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { PrivateReceiptImage, PrivateReceiptLink, PrivateStorageImage } from './src/components/PrivateReceipt.jsx';
    import { supabase } from './src/supabaseClient.js';
    const files=${JSON.stringify(attachments)};
    const provider=${JSON.stringify(providerOrigin)};
    const publicKey=${JSON.stringify(publicAnonKey)};
    const record={receiptReferences:files.map(file=>file.reference),marketPrice:123.45,quantity:2};
    localStorage.setItem(${JSON.stringify(PRESERVE_KEY)},JSON.stringify(record));
    const allowedSigned=value=>{try{const url=new URL(value);return url.origin===provider&&files.some(file=>decodeURIComponent(url.pathname)==='/storage/v1/object/sign/'+file.bucket+'/'+file.path)}catch{return false}};
    const safeFetch=async(url,init={})=>{const response=await fetch(url,{...init,credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});return response};
    const expiredStorageResponse=${isExpiredStorageResponse.toString()};
    const probeRevokedSigners=${probeRevokedAttachmentSigners.toString()};
    const denied=async response=>{if(![400,401,403,404].includes(response.status))return false;try{const body=await response.json();return ['401','403','404','AccessDenied','NoSuchKey','NoSuchBucket','unauthorized','not_found'].includes(String(body.code||body.error||body.statusCode||''))||['401','403','404'].includes(String(body.statusCode||''))}catch{return false}};
    window.__code3ReceiptQa={
      async signIn(credentials){const result=await supabase.auth.signInWithPassword(credentials);return{ok:!result.error,userId:result.data?.user?.id||''}},
      async signOutAndProbe(){
        const session=await supabase.auth.getSession();let oldToken=session.data?.session?.access_token||'';
        if(!oldToken)return{ok:false};
        const result=await supabase.auth.signOut({scope:'local'});
        const headers={apikey:publicKey,Authorization:'Bearer '+oldToken,'Content-Type':'application/json'};
        try{
          const validity=await safeFetch(provider+'/rest/v1/rpc/code3_current_session_valid',{method:'POST',headers,body:'{}'});
          const current=validity.ok?await validity.json():null;
          const signers=await probeRevokedSigners({files,provider,headers,request:safeFetch,denied});
          return{ok:!result.error,sessionDenied:validity.ok&&current===false,signers};
        }finally{oldToken=''}
      },
      async publicReferencesDenied(){for(const file of files){const response=await safeFetch(file.reference);if(!await denied(response))return false}return true},
      async signedUrlProbe(value){
        if(!allowedSigned(value))return{image:false,expired:false};
        const response=await safeFetch(value);
        if(response.status===200&&response.headers.get('content-type')?.startsWith('image/')){
          const bytes=await response.arrayBuffer();return{image:bytes.byteLength>0,expired:false};
        }
        let body;try{body=await response.json()}catch{return{image:false,expired:false}}
        return{image:false,expired:expiredStorageResponse(response.status,body)};
      },
      recordBytes(){return localStorage.getItem(${JSON.stringify(PRESERVE_KEY)})}
    };
    createRoot(document.getElementById('root')).render(React.createElement('main',{},
      React.createElement('h1',{},'Synthetic private attachment integration'),
      ...files.map(file=>React.createElement('section',{key:file.bucket},
        React.createElement('h2',{},file.bucket),
        React.createElement(file.bucket==='receipts'?PrivateReceiptImage:PrivateStorageImage,{src:file.reference,...(file.bucket==='receipts'?{}:{authorizePrivate:true}),alt:'Private synthetic '+file.bucket,width:120,height:90}),
        file.bucket==='receipts'?React.createElement(PrivateReceiptLink,{href:file.reference},'Private synthetic receipt link'):null))));
  `;
  const result = await build({ absWorkingDir: ROOT, stdin: { contents: source, resolveDir: ROOT, sourcefile: "code3-private-attachment-acceptance.jsx", loader: "jsx" },
    bundle: true, write: false, format: "iife", platform: "browser", target: "es2022", logLevel: "silent", loader: { ".css": "empty" },
    define: { "process.env.NODE_ENV": '"production"', "import.meta.env": JSON.stringify({ VITE_SUPABASE_URL: providerOrigin, VITE_SUPABASE_ANON_KEY: publicAnonKey }) } });
  const script = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic attachment integration</title></head><body><div id="root"></div><script>${script}</script></body></html>`;
}

export async function runHostedDeletionBrowserAcceptance(input) {
  const target = validateHostedDeletionBrowserInput(input);
  const { browserFixture, sentinel, publicAnonKey, assertFixture, reportCheck } = input;
  const { chromium, expect } = require("@playwright/test");
  const checks = [];
  const check = (condition, label) => { assert.ok(condition, label); reportCheck(true, label); checks.push(label); };
  const fixturePath = `/__code3_private_acceptance_${randomUUID()}.html`;
  const attachments = [...browserFixture.attachments, ...sentinel.attachments];
  const networkScope = { ...target, fixturePath, attachments };
  const browser = await chromium.launch({ headless: true, env: browserEnvironment() });
  const contexts = [];
  let phase = "initial verification";
  const evaluateNetwork = async (page, operation, value) => {
    let timer;
    try { return await Promise.race([page.evaluate(operation, value), new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error("Synthetic browser operation timed out")), 45_000); })]); }
    finally { clearTimeout(timer); }
  };
  async function context(html) {
    const current = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", serviceWorkers: "block", acceptDownloads: false });
    contexts.push(current);
    const state = { blocked: 0, pageErrors: 0, deletionPosts: 0, providerRequests: 0 };
    current.on("page", page => { page.on("pageerror", () => { state.pageErrors++; }); page.setDefaultTimeout(20_000); });
    await current.routeWebSocket("**/*", socket => { state.blocked++; socket.close(); });
    await current.route("**/*", async route => {
      const request = route.request();
      if (!browserRequestAllowed(networkScope, request.url(), request.method())) { state.blocked++; return route.abort(); }
      const url = new URL(request.url());
      if (url.origin === target.providerOrigin) state.providerRequests++;
      if (url.origin === target.appOrigin && url.pathname === "/api/account/deletion" && request.method() === "POST") state.deletionPosts++;
      if (url.pathname === fixturePath && html) return route.fulfill({ status: 200, contentType: "text/html", body: html, headers: { "Cache-Control": "no-store" } });
      try { if (await forwardProtectedPreviewResponse({ route, guardedConfig: input.guardedConfig, scope: networkScope })) return undefined; }
      catch { state.blocked++; return route.abort(); }
      return route.continue();
    });
    return { current, state };
  }
  const signInReceipt = async (page, fixture) => {
    await assertFixture(fixture);
    const signed = await evaluateNetwork(page, credentials => window.__code3ReceiptQa.signIn(credentials), { email: fixture.email, password: fixture.password });
    assert.ok(signed.ok && signed.userId === fixture.id, "Only the verified synthetic account may sign in");
  };
  const boundReceiptImages = async page => {
    await expect(page.locator("img")).toHaveCount(TEST_BUCKETS.length);
    const bound = [];
    for (const file of browserFixture.attachments) {
      const image = page.getByRole("img", { name: `Private synthetic ${file.bucket}`, exact: true });
      await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true);
      const identity = signedAttachmentInfo(await image.getAttribute("src"), target.providerOrigin, file);
      assert.ok(identity && identity.expiresAt > Date.now(), "Each loaded image must use its expected currently valid signed object");
      bound.push(identity);
    }
    return bound;
  };
  try {
    await assertFixture(browserFixture); await assertFixture(sentinel);
    phase = "private attachment component setup";
    const html = await buildReceiptComponentFixtureHtml({ providerOrigin: target.providerOrigin, publicAnonKey, attachments: browserFixture.attachments });
    const receipt = await context(html);
    const page = await receipt.current.newPage();
    await page.goto(`${target.appOrigin}${fixturePath}`, { waitUntil: "domcontentloaded" });
    const originalBytes = await page.evaluate(() => window.__code3ReceiptQa.recordBytes());
    await signInReceipt(page, browserFixture);
    const images = page.locator("img");
    const initialImages = await boundReceiptImages(page);
    check(initialImages.length === TEST_BUCKETS.length, "Browser component: all four loaded images match their exact private bucket and path");
    check(await evaluateNetwork(page, () => window.__code3ReceiptQa.publicReferencesDenied()), "Browser component: all former public attachment URLs are denied");
    const firstImage = page.getByRole("img", { name: "Private synthetic receipts", exact: true });
    const oldIdentity = initialImages.find(identity => identity.bucket === "receipts");
    assert.ok(oldIdentity && oldIdentity.expiresAt - Date.now() > 15_000 && oldIdentity.expiresAt - Date.now() <= 65_000, "The real signer must issue the expected short-lived token with enough time to test it");
    const expiryProbe = new URL(oldIdentity.url);
    expiryProbe.searchParams.set("qa", randomUUID());
    const preExpiry = await evaluateNetwork(page, value => window.__code3ReceiptQa.signedUrlProbe(value), expiryProbe.href);
    check(preExpiry.image === true && Date.now() < oldIdentity.expiresAt, "Browser component: the exact uncached expiry probe serves its image before token expiry");
    phase = "private attachment URL renewal";
    const renewalDeadline = oldIdentity.expiresAt - 500;
    const receiptFile = browserFixture.attachments.find(file => file.bucket === "receipts");
    await expect.poll(async () => {
      if (Date.now() >= renewalDeadline || !await firstImage.count()) return false;
      const image = await firstImage.evaluate(node => ({ url: node.getAttribute("src"), loaded: node.complete && node.naturalWidth > 0 }));
      const next = signedAttachmentInfo(image.url, target.providerOrigin, receiptFile);
      return image.loaded && completedRenewalBeforeExpiry(oldIdentity, next, Date.now());
    }, { timeout: Math.max(1, renewalDeadline - Date.now()), intervals: [250] }).toBe(true);
    check(true, "Browser component: private attachment renews through the real signer before expiry");
    // Reuse the identical query and token already proven to serve an image.
    // Generic 4xx, malformed-query and unrelated permission errors cannot prove
    // expiry. Never advance a fake clock in place of the provider's real time.
    const untilExpired = Math.max(0, oldIdentity.expiresAt + 2_000 - Date.now());
    if (untilExpired) await page.waitForTimeout(untilExpired);
    const expired = await evaluateNetwork(page, value => window.__code3ReceiptQa.signedUrlProbe(value), expiryProbe.href);
    check(expired.expired === true && expired.image === false, "Browser component: the original uncached URL returns an explicit token expiry error");
    await boundReceiptImages(page);
    phase = "private attachment session revocation";
    const revoked = await evaluateNetwork(page, () => window.__code3ReceiptQa.signOutAndProbe());
    check(revoked.ok && revoked.sessionDenied && revoked.signers?.length === TEST_BUCKETS.length
      && TEST_BUCKETS.every(bucket => revoked.signers.some(result => result.bucket === bucket && result.denied)), "Browser component: revoked session cannot validate or sign any of the four private objects");
    await expect(images).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Private synthetic receipt link", exact: true })).toHaveCount(0);
    check(true, "Browser component: sign-out removes rendered private images and links");
    await signInReceipt(page, sentinel);
    await expect.poll(() => page.getByText("This saved file could not be opened with your current account.", { exact: false }).count()).toBeGreaterThanOrEqual(TEST_BUCKETS.length);
    await expect(images).toHaveCount(0);
    check(true, "Browser component: another real account cannot display the owner's attachment references");
    await signInReceipt(page, browserFixture);
    await boundReceiptImages(page);
    check(await page.evaluate(() => window.__code3ReceiptQa.recordBytes()) === originalBytes, "Browser component: original receipt references and saved price sentinel remain byte-identical");
    check(receipt.state.blocked === 0 && receipt.state.pageErrors === 0 && receipt.state.providerRequests > 0, "Browser component: only real isolated provider traffic was used without page errors");
    await receipt.current.close();

    phase = "deployed public deletion sign-in";
    const deployed = await context();
    const publicPage = await deployed.current.newPage();
    await deployed.current.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, { key: PRESERVE_KEY, value: originalBytes });
    await publicPage.goto(`${target.appOrigin}/delete-account`, { waitUntil: "domcontentloaded" });
    await expect(publicPage.getByRole("heading", { name: "Delete your account", exact: true })).toBeVisible();
    await assertFixture(browserFixture);
    await publicPage.getByLabel("Account email", { exact: true }).fill(browserFixture.email);
    await publicPage.getByLabel("Account password", { exact: true }).fill(browserFixture.password);
    await publicPage.getByRole("button", { name: "Sign in", exact: true }).click();
    const reviewButton = publicPage.getByRole("button", { name: "Review account deletion", exact: true });
    await expect(reviewButton).toBeEnabled();
    await reviewButton.click();
    await expect(publicPage.getByText(browserFixture.email, { exact: true })).toBeVisible();
    check(true, "Deployed UI: real sign-in and HTTPS deletion review identify the synthetic account");
    const submit = publicPage.getByRole("button", { name: "Permanently delete my account", exact: true });
    await expect(submit).toBeDisabled();
    await publicPage.getByRole("button", { name: "Cancel", exact: true }).click();
    check(deployed.state.deletionPosts === 0, "Deployed UI: cancelling review sends no deletion request");
    await reviewButton.click();
    await expect(publicPage.getByLabel("Confirm your account password", { exact: true })).toHaveValue("");
    await expect(publicPage.getByRole("checkbox")).not.toBeChecked();
    await publicPage.getByLabel("Confirm your account password", { exact: true }).fill("Deliberately-wrong-synthetic-password");
    await publicPage.getByLabel("Type DELETE MY ACCOUNT", { exact: true }).fill("DELETE MY ACCOUNT");
    await expect(submit).toBeDisabled();
    await publicPage.getByRole("checkbox").check();
    phase = "deployed wrong-password confirmation";
    await submit.click();
    await expect(publicPage.getByRole("alert")).toContainText("Password confirmation failed");
    await expect(publicPage.getByLabel("Confirm your account password", { exact: true })).toHaveValue("");
    check(deployed.state.deletionPosts === 1, "Deployed UI: wrong password is rejected by the actual HTTPS service");
    phase = "deployed confirmed synthetic deletion";
    await assertFixture(browserFixture);
    await publicPage.getByLabel("Confirm your account password", { exact: true }).fill(browserFixture.password);
    await submit.focus(); await publicPage.keyboard.press("Enter");
    await expect(publicPage.getByRole("heading", { name: "Account deleted", exact: true })).toBeVisible({ timeout: 90_000 });
    check(deployed.state.deletionPosts === 2, "Deployed UI: one password-confirmed request completes synthetic account deletion");
    check(await publicPage.evaluate(key => localStorage.getItem(key), PRESERVE_KEY) === originalBytes, "Deployed UI: confirmed deletion preserves separate device copies and saved price sentinel");
    phase = "deployed completion account isolation";
    await assertFixture(sentinel);
    const second = await deployed.current.newPage();
    await second.goto(`${target.appOrigin}/delete-account`, { waitUntil: "domcontentloaded" });
    await second.getByLabel("Account email", { exact: true }).fill(sentinel.email);
    await second.getByLabel("Account password", { exact: true }).fill(sentinel.password);
    await second.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(second.getByRole("button", { name: "Review account deletion", exact: true })).toBeEnabled();
    await expect(publicPage.getByRole("heading", { name: "Account deleted", exact: true })).toHaveCount(0);
    await second.getByRole("button", { name: "Review account deletion", exact: true }).click();
    await expect(second.getByText(sentinel.email, { exact: true })).toBeVisible();
    await expect(second.getByRole("checkbox")).not.toBeChecked();
    await second.getByRole("button", { name: "Cancel", exact: true }).click();
    check(deployed.state.deletionPosts === 2, "Deployed UI: switching to the sentinel clears prior deletion completion without deleting the sentinel");
    check(await second.evaluate(key => localStorage.getItem(key), PRESERVE_KEY) === originalBytes, "Deployed UI: account switching leaves original device references and prices unchanged");
    check(deployed.state.blocked === 0 && deployed.state.pageErrors === 0 && deployed.state.providerRequests > 0, "Deployed UI: real HTTPS and isolated Auth requests complete without mocks or unexpected destinations");
    return { deployedDeletionUiVerified: true, receiptComponentHostedIntegrationVerified: true, deployedReceiptWorkflowVerified: false,
      physicalDevicesVerified: false, nativeOriginVerified: false, checks };
  } catch {
    // Playwright errors can embed filled values, signed URLs and request text.
    // Never propagate them, persist traces/HAR/storageState, or copy them into
    // the report. Only this adapter-authored phase is safe to expose.
    throw Object.assign(new Error(`Isolated browser acceptance failed during ${phase}.`), { code: "code3_browser_acceptance_failed", browserPhase: phase });
  } finally {
    await Promise.allSettled(contexts.map(current => current.close()));
    await browser.close().catch(() => undefined);
  }
}
