import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Read-only, unauthenticated production probes. Never submit a report, deletion,
// login, or private-record request, and never send browser credentials.
const probes = [
  ["App login", "https://code3tcg.app/", [200]],
  ["PWA manifest", "https://code3tcg.app/manifest.webmanifest", [200]],
  ["Deletion help", "https://code3tcg.app/delete-account", [200]],
  ["Privacy policy availability", "https://code3tcg.com/privacy", [200]],
  ["Terms availability", "https://code3tcg.com/terms", [200]],
  ["Backend health", "https://code3tcg.app/api/health", [200]],
  ["Account status requires authentication", "https://code3tcg.app/api/account/deletion/status", [401]],
  ["Missing release asset must not return app HTML", "https://code3tcg.app/assets/code3-launch-missing-check.js", [404]],
];
const results = [];
for (const [name, url, expected] of probes) {
  try {
    const response = await fetch(url, { method: "GET", credentials: "omit", redirect: "follow", signal: AbortSignal.timeout(12000) });
    const type = response.headers.get("content-type") || "";
    const item = { name, url, status: response.status, contentType: type, pass: expected.includes(response.status) };
    if (name === "PWA manifest" && response.ok) {
      const manifest = await response.json();
      item.pass = item.pass && /code\s*3/i.test(manifest.name || "") && Array.isArray(manifest.icons) && manifest.icons.length > 0;
    } else await response.body?.cancel();
    results.push(item);
  } catch { results.push({ name, url, pass: false, error: "The public endpoint could not be verified within the request timeout." }); }
}
const output = resolve(process.argv[2] || "artifacts/qa/nationwide-launch-20261108");
await mkdir(output, { recursive: true });
await writeFile(resolve(output, "public-endpoints.json"), JSON.stringify({ checkedAt: new Date().toISOString(), productionWrites: 0, results }, null, 2));
console.log(JSON.stringify(results));
if (results.some(result => !result.pass)) process.exitCode = 1;
