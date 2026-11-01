// Actual recovery/copy components with synthetic records; no account or storage writes.
import { build } from "esbuild";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
if (process.env.VERCEL || process.env.NODE_ENV === "production") throw new Error("Cloud review preview is local-only.");
const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "artifacts/qa/cloud-review-100");
await mkdir(out, { recursive: true });
await build({ stdin: { resolveDir: root, loader: "jsx", contents: `
import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
import Differences from './src/features/persistence/CloudConflictDifferences.jsx';
import Status from './src/features/persistence/CloudSavingStatus.jsx';
import {PortfolioItemGrid} from './src/components/CollectionPortfolioViews.jsx';
import './src/styles/theme.css'; import './src/features/persistence/cloud-workspace.css';
const device={schemaVersion:1,data:{items:[{id:'copy-A',name:'Example card',quantity:2,notes:'Keep gift copy',physicalLocation:'Blue binder',updatedAt:'2026-10-25T14:00:00Z'}]}};
const cloud={schemaVersion:1,data:{items:[{id:'copy-A',name:'Example card',quantity:3,notes:'Keep gift copy',physicalLocation:'Trade box',updatedAt:'2026-10-25T16:00:00Z'}]}};
const item={displayName:'Synthetic collection',device,cloud};
const messages={CONFLICT:'This device and another device changed the same saved group.',OFFLINE:'Cloud saving could not be reached.',PENDING:'New changes are saved on this device and waiting to sync.',CLOUD_VALIDATION_FAILED:'The server declined this snapshot.',PAYLOAD_WRITE_FAILED:'The device payload could not be verified.',SYNCED:'Saved to your account.'};
function Preview(){const [status,setStatus]=useState('CONFLICT');return <main className="app app-command-shell" data-theme="light"><header><p>CODE 3 TCG · LOCAL PREVIEW</p><h1>Review changes with confidence</h1><p>Actual app components, synthetic records. No accounts, saved records or credentials are accessed.</p></header><section className="cloud-workspace-panel"><h2>Cloud saving status</h2><label>Example status<select value={status} onChange={event=>setStatus(event.target.value)}>{Object.keys(messages).map(value=><option key={value}>{value}</option>)}</select></label><Status status={{status,message:messages[status]}} enabled={true}/><h2>Compare conflicting copies</h2><Differences item={item} revision={8} cloudSavedAt="2026-10-25T16:00:00Z"/></section><section><h2>Distinguish individual copies</h2><PortfolioItemGrid mode="list" items={[{id:'copy-A',name:'Example card',quantity:2,variant:'Holo',language:'English',conditionName:'Near Mint',physicalLocation:'Blue binder · page 3',notes:'Gift copy — keep separate'},{id:'copy-B',name:'Example card',quantity:1,variant:'Reverse holo',language:'Japanese',conditionName:'Played',physicalLocation:'Trade box',notes:'Corner wear'}]}/></section></main>}
createRoot(document.getElementById('root')).render(<Preview/>);
` }, bundle: true, jsx: "automatic", external: ["/assets/*"], outfile: resolve(out, "bundle.js"), define: { "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "unrelated-ui-placeholders", setup(builder) { builder.onLoad({ filter: /ItemPhoto\.jsx$/ }, () => ({ contents: "export default function ItemPhoto(){return null}", loader: "jsx" })); builder.onLoad({ filter: /OperationsUI\.jsx$/ }, () => ({ contents: "export const BottomSheet = () => null;", loader: "jsx" })); } }] });
await writeFile(resolve(out, "index.html"), `<!doctype html><html lang="en"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Code 3 cloud review — local preview</title><link rel="stylesheet" href="/bundle.css"><style>*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui;background:#f8f1e4;color:#29231e}main{max-width:1000px;margin:auto;padding:24px;color:var(--text-primary)}h1{line-height:1.2}h2{font-size:22px}section{margin-block:24px;padding:20px;border:1px solid var(--border-subtle);border-radius:16px;background:var(--surface-primary);min-width:0}select{display:block;min-height:44px;max-width:100%;padding:8px;font:inherit;background:var(--surface-primary);color:var(--text-primary)}.collection-portfolio-grid{padding:0;list-style:none}.collection-portfolio-item{width:100%;text-align:left;background:var(--surface-primary);color:var(--text-primary);border:1px solid var(--border-subtle);border-radius:12px;font:inherit;margin-block:8px}.collection-portfolio-item-copy{display:grid;gap:6px;padding:16px}.collection-portfolio-item-media{display:none}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:480px){main{padding:12px}section{padding:12px}}</style><div id="root"></div><script src="/bundle.js"></script></html>`);
const assets = { "/": ["index.html", "text/html; charset=utf-8"], "/bundle.js": ["bundle.js", "application/javascript"], "/bundle.css": ["bundle.css", "text/css"] };
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://127.0.0.1").pathname;
  const publicAsset = { "/assets/brand-system/code3-tokens.css": "text/css", "/assets/fonts/SpaceGrotesk-Variable.ttf": "font/ttf" }[pathname];
  if (publicAsset) { res.writeHead(200, { "Content-Type": publicAsset }); res.end(await readFile(resolve(root, "public", pathname.slice(1)))); return; }
  const asset = assets[pathname];
  if (!asset) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": asset[1], "Cache-Control": "no-store" }); res.end(await readFile(resolve(out, asset[0])));
});
server.listen(0, "127.0.0.1", () => console.log(`Cloud review preview: http://127.0.0.1:${server.address().port}`));
