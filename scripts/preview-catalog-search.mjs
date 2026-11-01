// Loopback-only interaction fixture. Synthetic catalog; no keys or live APIs.
import { build } from "esbuild";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
if (process.env.VERCEL || process.env.NODE_ENV === "production") throw new Error("Catalog fixture is local-only.");
const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "artifacts/qa/catalog-search-100");
await mkdir(out, { recursive: true });
const fixtureService = `
export const normalizeCatalogQuery = value => String(value || '').trim().toLowerCase();
export const detectCatalogSearchMode = () => 'general';
export const isCatalogSearchDebugEnabled = () => false;
export const getCachedCatalogRecommendations = () => null;
const pending = [];
export function getCatalogRecommendations(args) { return new Promise((resolve, reject) => { pending.push({args,resolve,reject}); window.dispatchEvent(new Event('catalog-fixture')); }); }
export const pendingCount = () => pending.length;
export function resolvePending(fail = false) { for (const request of pending.splice(0)) { if (fail) request.reject(new Error('Synthetic connection failure. Retry this search.')); else request.resolve({ suggestions: Array.from({length:12}, (_, index) => ({id:request.args.query+'-'+index, label:request.args.query+' match '+(index+1), searchValue:request.args.query+' match '+(index+1), section:'Synthetic matches', type:'Card', description:'Example set · English · No live data'})) }); } window.dispatchEvent(new Event('catalog-fixture')); }
`;
await build({
  stdin: { resolveDir: root, loader: "jsx", contents: `
    import React,{useState,useEffect} from 'react'; import {createRoot} from 'react-dom/client';
    import Search from './src/components/SmartCatalogSearchBox.jsx';
    import {resolvePending,pendingCount} from './src/services/pokemonCatalogSearch';
    const source={}; const empty=[];
    const products=Array.from({length:16},(_,index)=>({id:'synthetic-'+index,name:index===0?'Mew & Mewtwo GX':index===1?'✨ Pokémon: Eevee & Friends':'Pokemon catalog example '+(index+1),setName:'Example set',productType:'Card',marketPrice:0}));
    function Fixture(){const [value,setValue]=useState('Pokemon'),[other,setOther]=useState('Mewtwo'),[remote,setRemote]=useState(false),[chosen,setChosen]=useState('None'),[full,setFull]=useState('None'),[pending,setPending]=useState(0),[close,setClose]=useState(0);
      useEffect(()=>{const update=()=>setPending(pendingCount());window.addEventListener('catalog-fixture',update);return()=>window.removeEventListener('catalog-fixture',update)},[]);
      return <main><header><p>CODE 3 TCG · LOCAL VERIFICATION</p><h1>Catalog search improvements</h1><p>Synthetic catalog only. No live API requests or saved app data.</p></header>
      <section aria-label="Preview controls"><button onClick={()=>setRemote(false)}>Use local catalog</button><button onClick={()=>setRemote(true)}>Use delayed catalog</button><button onMouseDown={event=>event.preventDefault()} onClick={()=>resolvePending()}>Resolve pending matches</button><button onMouseDown={event=>event.preventDefault()} onClick={()=>resolvePending(true)}>Simulate connection error</button><button onMouseDown={event=>event.preventDefault()} onClick={()=>setClose(x=>x+1)}>Parent closes suggestions</button><button onMouseDown={event=>event.preventDefault()} onClick={()=>document.querySelector('[aria-label="Primary catalog search"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,isComposing:true}))}>Simulate composing Enter</button></section>
      <p role="status">Mode: {remote?'delayed':'local'} · Pending requests: {pending}</p>
      <section className="preview-card"><h2>Find a card or product</h2><Search value={value} onChange={setValue} onSelectSuggestion={row=>setChosen(row.label)} onSearch={setFull} inputLabel="Primary catalog search" placeholder="Card name, set or collector number" localCatalogProducts={remote?empty:products} maxSuggestions={12} isSupabaseConfigured={remote} supabase={remote?source:null} closeSignal={close}/></section>
      <section className="preview-card"><h2>Independent second search</h2><Search value={other} onChange={setOther} inputLabel="Second catalog search" localCatalogProducts={products}/></section>
      <section className="preview-card result"><h2>Interaction results</h2><p>Last selection: {chosen}</p><p>Full search: {full}</p><button>Continue outside search</button></section></main>}
    createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture/></React.StrictMode>);
  ` },
  bundle: true, outfile: resolve(out, "bundle.js"), jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"', "import.meta.env": "{}" },
  plugins: [{ name: "synthetic-catalog-only", setup(builder) {
    builder.onResolve({ filter: /\/services\/pokemonCatalogSearch(?:\.js)?$/ }, () => ({ path: "catalog", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: fixtureService, loader: "js" }));
  } }],
});
await writeFile(resolve(out, "index.html"), `<!doctype html><html lang="en"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Code 3 catalog search — local verification</title><link rel="stylesheet" href="/bundle.css"><style>:root{--border-subtle:#d9cdbc;--surface-primary:#fffaf2;--surface-secondary:#f5ecdf;--text-primary:#29231e;--text-secondary:#665b4e;--action-primary:#7a0f1e;--focus-ring:#247080}*{box-sizing:border-box}body{margin:0;background:#f8f1e4;color:var(--text-primary);font-family:system-ui}main{max-width:900px;margin:auto;padding:24px}h1{margin-block:8px;font-size:28px}h2{font-size:19px}header>p:first-child{color:#7a0f1e;font-weight:bold}section[aria-label]{display:flex;flex-wrap:wrap;gap:8px}button{min-height:44px;border:1px solid #b5a48c;border-radius:8px;padding:8px 12px;background:#fffaf2;color:inherit;font:inherit}input{padding:12px;border:1px solid #a9957e;border-radius:8px;font:inherit}input:focus-visible,button:focus-visible{outline:3px solid #247080;outline-offset:2px}.preview-card{margin-top:16px;padding:20px;border:1px solid #d9cdbc;border-radius:16px;background:#fffcf7}.result{margin-top:340px}@media(max-width:480px){main{padding:14px}.preview-card{padding:14px}.result{margin-top:310px}}</style><div id="root"></div><script src="/bundle.js"></script></html>`);
const assets = { "/": ["index.html", "text/html"], "/bundle.js": ["bundle.js", "application/javascript"], "/bundle.css": ["bundle.css", "text/css"] };
const server = createServer(async (req, res) => {
  const asset = assets[new URL(req.url, "http://127.0.0.1").pathname];
  if (!asset) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": asset[1], "Cache-Control": "no-store" });
  res.end(await readFile(resolve(out, asset[0])));
});
server.listen(0, "127.0.0.1", () => console.log(`Catalog interaction preview: http://127.0.0.1:${server.address().port}`));
