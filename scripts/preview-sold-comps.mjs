// Local UI/API verification with synthetic sales. Never uses provider keys.
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import express from "express";
import { build } from "esbuild";
if (process.env.VERCEL || process.env.NODE_ENV === "production") throw new Error("Synthetic preview is local-only.");
const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "artifacts/qa/comps-preview");
await mkdir(out, { recursive: true });
await build({
  stdin: { resolveDir: root, loader: "jsx", contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Comparison from './src/components/MarketSourceComparison.jsx';
    const item={name:'Charizard',setName:'Base Set',cardNumber:'4/102',variant:'Holofoil',language:'English',condition:'NM',catalogType:'card'};
    createRoot(document.getElementById('root')).render(<main><h1>Local price-check preview</h1><p>Synthetic sales for verification; no real provider requests.</p><Comparison marketItem={item} productName="Charizard" /></main>);` },
  bundle: true, outfile: resolve(out, "bundle.js"), jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "local-auth-only", setup(builder) {
    builder.onResolve({ filter: /\/supabaseClient\.js$/ }, () => ({ path: "auth", namespace: "fixture" }));
    builder.onResolve({ filter: /\/ownerSession\.js$/ }, () => ({ path: "owner", namespace: "fixture" }));
    builder.onResolve({ filter: /\/nativeRuntime\.js$/ }, () => ({ path: "native", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "auth" ? "export const supabase=null;" : args.path === "owner" ? "export const getOwnerRequestHeaders=async()=>({'x-test-owner':'fixture'}); export const isLocalDevelopmentIdentityEnabled=()=>false;" : "export const getApiBase=()=>'';", loader: "js" }));
  } }],
});
await writeFile(resolve(out, "index.html"), `<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sold market estimate — local verification</title><link rel="stylesheet" href="/bundle.css"><style>:root{--border-subtle:#d9cdbc;--border-strong:#a9957e;--surface-primary:#fffaf2;--surface-secondary:#f5ecdf;--text-primary:#29231e;--text-secondary:#665b4e;--action-primary:#7a0f1e;--on-primary:#fff;--focus-ring:#247080;--status-danger:#9f2020;--status-success:#12623b}*{box-sizing:border-box}body{background:#f8f1e4;font-family:system-ui;margin:0;padding:20px}main{max-width:1050px;margin:auto}h1{font-size:24px}</style><div id="root"></div><script src="/bundle.js"></script></html>`);
process.env.COMPSAPI_ENABLED = "true";
process.env.COMPSAPI_API_KEY = "TEST_ONLY_SYNTHETIC_PREVIEW";
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.origin !== "https://api.compsapi.com") return nativeFetch(input, init);
  return new Response(JSON.stringify({ ok: true, source: "ebay", items: [10, 12, 14].map((price, index) => ({
    item_id: String(800000000000 + index), title: "Charizard Base Set 4/102 Holo English NM", price,
    last_sold: new Date(Date.now() - 86_400_000).toISOString(), units_sold: 1, us_sale: true,
    card: { card_number: "4/102", graded: false, condition: "nm", language: "en", first_edition: false, flags: [] },
  })) }), { headers: { "content-type": "application/json" } });
};
const require = createRequire(import.meta.url);
const { createEbayRouter } = require("../backend/dist/routes/ebay.routes.js");
const app = express(); app.use(express.json());
app.use("/api/ebay", createEbayRouter((req, res, next) => {
  if (req.get("x-test-owner") !== "fixture") return res.status(401).json({ error: { code: "authentication_required" } });
  res.locals.authPrincipal = { provider: "test", subject: "fixture" }; next();
}));
app.use(express.static(out));
const server = app.listen(0, "127.0.0.1", () => console.log(`Synthetic UI/API preview: http://127.0.0.1:${server.address().port}`));
