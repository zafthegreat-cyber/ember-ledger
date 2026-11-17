import {useEffect,useMemo,useState} from "react";
import {EVIDENCE_LABELS,RETAILER_NAMES,SIGNAL_KINDS,filterStockIntelligence,loadStockIntelligence} from "../services/stockIntelligence.mjs";
import StockSignalReview from "./StockSignalReview.jsx";
import WarehouseInboundPanel from "./WarehouseInboundPanel.jsx";
import "./stock-intelligence-panel.css";

const STORAGE_KEY = "code3.stock-intelligence.device-pins.v1";
const labelFor = record => record.retailer + ":" + record.sku;
function initialPins() {
  try {
    const data = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(data) ? data.filter(x => typeof x === "string" && x.length < 100).slice(0,80) : [];
  } catch { return []; }
}
function timeAgo(value,now) {
  const minutes = Math.max(0,Math.floor((now-Date.parse(value))/60000));
  if (!Number.isFinite(minutes)) return "Time unavailable";
  if (minutes < 1) return "Just now";
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.floor(minutes/60);
  if (hours < 24) return hours + "h ago";
  return Math.floor(hours/24) + "d ago";
}
function statusText(source) {
  if (!source.connected) return "Not connected";
  if (!source.lastSuccessAt) return "Connected · no successful checks yet";
  return "Last successful source check";
}
const SHORT_SIGNALS = Object.freeze({
  available_now: "Official/admin-checked",
  queue_detected: "Queue activity only",
  possible_drop: "Early signal",
  reported_stock: "Not confirmed live",
});

export default function StockIntelligencePanel() {
  const [snapshot,setSnapshot] = useState(null);
  const [phase,setPhase] = useState("loading");
  const [revision,setRevision] = useState(0);
  const [updated,setUpdated] = useState(0);
  const [active,setActive] = useState("products");
  const [retailer,setRetailer] = useState("All");
  const [query,setQuery] = useState("");
  const [pins,setPins] = useState(initialPins);
  const [onlyPins,setOnlyPins] = useState(false);
  const [showAll,setShowAll] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let waiting = false;
    async function refresh(silent=false) {
      if (waiting || controller.signal.aborted) return;
      waiting=true;
      if (!silent) setPhase("loading");
      try {
        const data = await loadStockIntelligence({signal:controller.signal});
        if (!controller.signal.aborted) {
          setSnapshot(data);setPhase("ready");setUpdated(Date.now());
        }
      } catch {
        if (!controller.signal.aborted) {setPhase("error");setSnapshot(null);}
      } finally {waiting=false;}
    }
    refresh();
    const timer = globalThis.setInterval(() => {
      if (globalThis.document?.visibilityState !== "hidden") refresh(true);
    }, 60000);
    return () => {controller.abort();globalThis.clearInterval(timer);};
  },[revision]);
  const now = updated;
  const selection=useMemo(()=>snapshot ? filterStockIntelligence(snapshot,{retailer,query}):{targets:[],signals:[]},[snapshot,retailer,query]);
  const products = useMemo(()=>{
    const next = onlyPins ? selection.targets.filter(p=>pins.includes(labelFor(p))) : selection.targets;
    return [...next].sort((a,b)=>{
      const aPin=pins.includes(labelFor(a))?0:1,bPin=pins.includes(labelFor(b))?0:1;
      return aPin-bPin || a.retailer.localeCompare(b.retailer) || a.name.localeCompare(b.name);
    });
  },[selection.targets,pins,onlyPins]);
  const visibleProducts = showAll || query.trim() || onlyPins ? products : products.slice(0,4);
  const connected = snapshot?.sources?.filter(s=>s.connected).length||0;
  const signalCount = snapshot?.signals?.length||0;
  function togglePin(p) {
    const id=labelFor(p);
    setPins(current=>{
      const next=current.includes(id)?current.filter(x=>x!==id):[...current,id].slice(-80);
      try {globalThis.localStorage?.setItem(STORAGE_KEY,JSON.stringify(next));} catch {/* Local device storage is optional. */}
      return next;
    });
  }
  return (
    <section className="stock-intel" aria-label="Online stock intelligence">
      <header className="stock-intel__heading">
        <div>
          <span className="stock-intel__eyebrow">Code 3 TCG · Find</span>
          <h3>Stock intelligence</h3>
          <p>Watch products across retailers. See what's reported, what was checked, and where an alert came from.</p>
        </div>
        <button type="button" className="stock-intel__refresh" onClick={()=>setRevision(v=>v+1)} disabled={phase==="loading"}>Refresh feed</button>
      </header>
      {phase==="loading" && <div className="stock-intel__message" role="status">Loading verified watchlist and signal status…</div>}
      {phase==="error" && <div className="stock-intel__message stock-intel__message--error" role="alert">
        <strong>Stock data isn't available right now.</strong>
        <p>We won't show stale inventory as live stock. Try refreshing or check retailer links directly.</p>
        <button type="button" onClick={()=>setRevision(v=>v+1)}>Try again</button>
      </div>}
      {phase==="ready" && snapshot && <>
        <div className="stock-intel__metrics" aria-label="Stock monitoring summary">
          <div><strong>{snapshot.targets.length}</strong><span>Individual products</span></div>
          <div><strong>{signalCount}</strong><span>Current signals</span></div>
          <div><strong>{connected}/{snapshot.sources.length}</strong><span>Connected sources</span></div>
        </div>
        <div className="stock-intel__notice" role="status">
          <span className="stock-intel__notice-dot" aria-hidden="true"/>
          <p><strong>{connected ? "Source-based intelligence" : "Watchlist ready · Sources not yet connected"}</strong>
          {connected ? " — Only approved connections can create automatic observations." : " — Saved products aren't being checked automatically until approved feeds are connected."}
          <small>{snapshot.discoveryWatches.length} category discovery watches configured. Feed loaded {timeAgo(snapshot.generatedAt,now)}; this is not a retailer stock-check timestamp.</small></p>
        </div>
        <div className="stock-intel__tabs" aria-label="Stock intelligence sections">
          <button type="button" aria-pressed={active==="products"} className={active==="products"?"is-active":""} onClick={()=>setActive("products")}>Products <span>{snapshot.targets.length}</span></button>
          <button type="button" aria-pressed={active==="signals"} className={active==="signals"?"is-active":""} onClick={()=>setActive("signals")}>Signals <span>{signalCount}</span></button>
          <button type="button" aria-pressed={active==="inbound"} className={active==="inbound"?"is-active":""} onClick={()=>setActive("inbound")}>Inbound / Warehouse</button>
          <button type="button" aria-pressed={active==="sources"} className={active==="sources"?"is-active":""} onClick={()=>setActive("sources")}>Sources</button>
        </div>
        {(active==="products" || active==="signals") && <div className="stock-intel__filters">
          <label>Retailer<select value={retailer} onChange={e=>setRetailer(e.target.value)}>
            <option value="All">All retailers</option>{RETAILER_NAMES.map(r=><option value={r} key={r}>{r}</option>)}
          </select></label>
          <label>Find a product or SKU<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Pokémon, Mew, 1012850572…"/></label>
        </div>}
        {active==="products" && <>
          <div className="stock-intel__list-heading">
            <div><strong>Products to watch</strong><p>These are tracking targets, not live stock claims.</p></div>
            <button type="button" aria-pressed={onlyPins} onClick={()=>setOnlyPins(v=>!v)} className={onlyPins?"is-active":""}>★ Pinned only ({pins.length})</button>
          </div>
          {products.length ? <ul className="stock-intel__products">
            {visibleProducts.map(p=>{
              const pinned=pins.includes(labelFor(p));
              const recent=selection.signals.find(s=>s.retailer===p.retailer && s.sku===p.sku);
              const current=recent && Date.parse(recent.expiresAt)>now ? recent:null;
              return <li key={labelFor(p)} className="stock-intel__product">
                <div className="stock-intel__product-top"><span className="stock-intel__retailer">{p.retailer}</span>
                  {current ? <span className={"stock-intel__status is-"+SIGNAL_KINDS[current.signalType].tone}>{SIGNAL_KINDS[current.signalType].label}</span> : <span className="stock-intel__status">No current stock signal</span>}
                </div>
                <strong>{p.name}</strong>
                <small>SKU {p.sku}</small>
                <div className="stock-intel__product-actions">
                  <a href={p.url} target="_blank" rel="noopener noreferrer">Open at {p.retailer}<span className="sr-only"> (opens new tab)</span></a>
                  <button type="button" aria-pressed={pinned} onClick={()=>togglePin(p)}>{pinned?"★ Pinned":"☆ Pin"}</button>
                </div>
              </li>;
            })}
          </ul> : <p className="stock-intel__empty" role="status">{selection.discoveryWatches.length && !query ? "No individual SKUs saved for this retailer yet. Its Pokémon discovery watch is listed below." : "No individual products match. Clear the search or change retailer."}</p>}
          {!showAll && !query.trim() && !onlyPins && products.length>4 && <button className="stock-intel__show-all" type="button" onClick={()=>setShowAll(true)}>Show all {products.length} tracked products</button>}
          {showAll && products.length>4 && !onlyPins && !query.trim() && <button className="stock-intel__show-all" type="button" onClick={()=>setShowAll(false)}>Show fewer products</button>}
          {selection.discoveryWatches.length > 0 && <div className="stock-intel__discovery">
            <div className="stock-intel__list-heading"><div><strong>Category discovery watches</strong><p>Tracks a product category, not a verified live inventory count.</p></div></div>
            <ul>{selection.discoveryWatches.map(watch=><li key={watch.retailer+"|"+watch.query} className="stock-intel__discovery-card">
              <span className="stock-intel__retailer">{watch.retailer}</span>
              <strong>{watch.query}</strong>
              <small>{snapshot.sources.find(source=>source.retailer===watch.retailer)?.connected ? "Approved source connected" : "Not connected · manual watch only"}</small>
            </li>)}</ul>
          </div>}
          <p className="stock-intel__footnote">★ Pins are saved on this device only. Pinning a product does not turn on push notifications or a retailer connection.</p>
        </>}
        {active==="signals" && <>
          <div className="stock-intel__list-heading">
            <div><strong>Recent source signals</strong><p>Only unexpired observations appear here.</p></div>
          </div>
          {selection.signals.length ? <ol className="stock-intel__signals">
            {selection.signals.map(s=><li key={s.id} className={"stock-intel__signal is-"+SIGNAL_KINDS[s.signalType].tone}>
              <div className="stock-intel__signal-top">
                <span className={"stock-intel__status is-"+SIGNAL_KINDS[s.signalType].tone}>{SIGNAL_KINDS[s.signalType].label}</span>
                <small>{timeAgo(s.observedAt,now)}</small>
              </div>
              <strong>{s.headline}</strong>
              <p>{s.product ? s.product+" · " : ""}{s.retailer}</p>
              <p>{SIGNAL_KINDS[s.signalType].explanation}</p>
              <div className="stock-intel__signal-bottom">
                <small>{EVIDENCE_LABELS[s.evidenceLevel]}{SHORT_SIGNALS[s.signalType]?" · "+SHORT_SIGNALS[s.signalType]:""}</small>
                <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer">Check source <span className="sr-only"> (opens new tab)</span></a>
              </div>
            </li>)}
          </ol> : <div className="stock-intel__empty" role="status"><strong>No current alerts match.</strong><p>A queue or inventory report will not be labeled as confirmed stock. Alerts appear only when there is a valid, recent source signal.</p></div>}
        </>}
        {active==="sources" && <div className="stock-intel__sources">
          <p>Retailer connectors must be approved and successfully tested before we're able to call them live.</p>
          <ul>{snapshot.sources.map(s=><li key={s.retailer}>
            <div><strong>{s.retailer}</strong>
              <small>{s.mode==="manual-watch"?"Manual/community watch":s.mode==="authorized-feed"?"Authorized partner feed":"Official API"}</small>
              {snapshot.discoveryWatches.filter(w=>w.retailer===s.retailer).map(w=><small key={w.query}>Discovery: {w.query} · {s.connected?"source connected":"not live"}</small>)}
            </div>
            <span className={"stock-intel__status "+(s.connected?"is-available":"")}>{statusText(s)}</span>
            {s.connected && s.lastSuccessAt && <small>Source checked {timeAgo(s.lastSuccessAt,now)}</small>}
          </li>)}</ul>
          <p className="stock-intel__footnote">A Pokémon Center queue is not proof of a product launch. No automatic checkout, queue bypass, or unauthorized Discord access is used.</p>
        </div>}
        {active==="inbound" && <WarehouseInboundPanel targets={snapshot.targets} />}
        {active!=="inbound" && <StockSignalReview targets={snapshot.targets} onPublished={()=>{setActive("signals");setRevision(v=>v+1);}} />}
      </>}
    </section>
  );
}
