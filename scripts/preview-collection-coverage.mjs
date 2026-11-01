// Loopback-only preview of real presentation components with synthetic records.
import { build } from "esbuild";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
if (process.env.VERCEL || process.env.NODE_ENV === "production") throw new Error("Coverage fixture is local-only.");
const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "artifacts/qa/collection-coverage-100");
await mkdir(out, { recursive: true });
await build({ stdin: { resolveDir: root, loader: "jsx", contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import Coverage from './src/components/CollectionValueCoverage.jsx';
import History from './src/components/MarketHistoryTable.jsx';
import Link from './src/components/ExternalWebLink.jsx';
import {summarizeCollectionPortfolio} from './src/utils/collectionValueCoverage.mjs';
const cards=[{quantity:3,marketPrice:12.5,status:'listed'},{quantity:2,targetPrice:40}];
const sealed=[{quantity:1,marketPrice:35}];
const summary=summarizeCollectionPortfolio({owned:[...cards,...sealed],cards,sealed,wishlist:[{quantity:4,targetPrice:100}]});
const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value);
const points=[{date:'2026-10-23T12:00:00Z',marketPrice:12,midPrice:12.5,lowPrice:10,highPrice:15,condition:'Near mint'},{date:'2026-10-24T12:00:00Z',marketPrice:12.5,midPrice:13,lowPrice:11,highPrice:null,condition:'Near mint'}];
createRoot(document.getElementById('root')).render(<main><header><p>CODE 3 TCG · LOCAL PREVIEW</p><h1>Clear collection values</h1><p>Real app components with synthetic records. Nothing is saved or sent to a provider.</p></header><section><h2>Owned value and coverage</h2><h3>{money(summary.totalKnownValue)} in known values</h3><Coverage summary={summary} money={money}/></section><section><h2>Accessible price history</h2><p>Example card · USD · Near mint</p><History points={points} productName="Example card" money={money}/></section><section><h2>Checked external destinations</h2><p><Link href="https://example.com/cards">Open source</Link></p><p><Link href="javascript:alert(1)">Imported invalid source</Link></p></section></main>);
` }, bundle: true, jsx: "automatic", outfile: resolve(out, "bundle.js"), define: { "process.env.NODE_ENV": '"development"' } });
await writeFile(resolve(out, "index.html"), `<!doctype html><html lang="en"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Code 3 collection coverage — local preview</title><link rel="stylesheet" href="/bundle.css"><style>:root{--border-subtle:#d9cdbc;--surface-primary:#fffaf2;--surface-secondary:#f5ecdf;--text-secondary:#665b4e;--focus-ring:#247080}*{box-sizing:border-box}body{margin:0;background:#f8f1e4;color:#29231e;font:16px/1.5 system-ui}main{max-width:950px;margin:auto;padding:24px}header>p:first-child{font-weight:700;color:#7a0f1e}h1{font-size:30px;line-height:1.2}h2{font-size:22px}h3{font-size:24px;color:#7a0f1e}section{min-width:0;margin-block:18px;padding:22px;background:#fffcf7;border:1px solid #d9cdbc;border-radius:16px}a{color:#7a0f1e;display:inline-flex;align-items:center;min-height:44px}a:focus-visible{outline:3px solid #247080;outline-offset:3px}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:480px){main{padding:14px}section{padding:14px}h1{font-size:27px}}</style><div id="root"></div><script src="/bundle.js"></script></html>`);
const assets = { "/": ["index.html", "text/html; charset=utf-8"], "/bundle.js": ["bundle.js", "application/javascript"], "/bundle.css": ["bundle.css", "text/css"] };
const server = createServer(async (req, res) => {
  const asset = assets[new URL(req.url, "http://127.0.0.1").pathname];
  if (!asset) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": asset[1], "Cache-Control": "no-store" });
  res.end(await readFile(resolve(out, asset[0])));
});
server.listen(0, "127.0.0.1", () => console.log(`Collection coverage preview: http://127.0.0.1:${server.address().port}`));
