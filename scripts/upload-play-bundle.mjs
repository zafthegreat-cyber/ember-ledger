// Uploads a signed Android bundle to Google Play as a DRAFT release (Nov 15, 2026).
//
// Used by .github/workflows/android-release.yml so the owner no longer downloads
// the build and drags it into Play Console. The release is always left as a
// draft: the owner still reviews it and clicks "Start rollout" in Play Console.
//
// Needs PLAY_SERVICE_ACCOUNT_JSON (a Google Cloud service-account key that was
// invited in Play Console → Users and permissions with release rights).
// Usage: node scripts/upload-play-bundle.mjs <bundle.aab> --track alpha --name "13 (1.0.0)" [--notes "..."]
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const PACKAGE_NAME = "com.code3tcg.app";
export const ALLOWED_TRACKS = new Set(["internal", "alpha", "beta"]); // never production from CI
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}`;
const UPLOAD_API = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PACKAGE_NAME}`;

export function parseArgs(argv) {
  const args = { bundle: "", track: "alpha", name: "", notes: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--track") args.track = argv[++i] ?? "";
    else if (flag === "--name") args.name = argv[++i] ?? "";
    else if (flag === "--notes") args.notes = argv[++i] ?? "";
    else if (!args.bundle) args.bundle = flag;
  }
  if (!args.bundle.endsWith(".aab")) throw new Error("Pass the path to a signed .aab bundle.");
  if (!ALLOWED_TRACKS.has(args.track)) throw new Error(`Track must be one of: ${[...ALLOWED_TRACKS].join(", ")}.`);
  return args;
}

/** The track update body: always a draft, so a person starts the rollout in Play Console. */
export function draftRelease({ versionCode, name, notes }) {
  const release = { name: String(name || versionCode).slice(0, 50), versionCodes: [String(versionCode)], status: "draft" };
  if (notes) release.releaseNotes = [{ language: "en-US", text: String(notes).slice(0, 500) }];
  return { releases: [release] };
}

const b64url = (value) => Buffer.from(value).toString("base64url");

async function accessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: account.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const assertion = `${header}.${claims}.${signer.sign(account.private_key, "base64url")}`;
  const res = await fetch(account.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(`Google sign-in for the service account failed (${res.status} ${json.error || ""}).`);
  return json.access_token;
}

async function call(token, url, init = {}) {
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json?.error?.message || res.statusText;
    throw new Error(`Play API ${res.status}: ${message}`);
  }
  return json;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const raw = env.PLAY_SERVICE_ACCOUNT_JSON || "";
  if (!raw.trim()) throw new Error("PLAY_SERVICE_ACCOUNT_JSON is not set.");
  let account;
  try { account = JSON.parse(raw); } catch { throw new Error("PLAY_SERVICE_ACCOUNT_JSON is not valid JSON (paste the whole key file)."); }
  if (!account.client_email || !account.private_key) throw new Error("PLAY_SERVICE_ACCOUNT_JSON is missing client_email or private_key.");

  const token = await accessToken(account);
  const edit = await call(token, `${API}/edits`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const bundle = await call(token, `${UPLOAD_API}/edits/${edit.id}/bundles?uploadType=media`, {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: readFileSync(args.bundle),
  });
  console.log(`Uploaded bundle, version code ${bundle.versionCode}.`);
  await call(token, `${API}/edits/${edit.id}/tracks/${args.track}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ track: args.track, ...draftRelease({ versionCode: bundle.versionCode, name: args.name, notes: args.notes }) }),
  });
  await call(token, `${API}/edits/${edit.id}:commit`, { method: "POST" });
  console.log(`Draft release "${args.name || bundle.versionCode}" is waiting on the ${args.track} track. Open Play Console to review it and start the rollout.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`::error::${error.message}`);
    process.exit(1);
  });
}
