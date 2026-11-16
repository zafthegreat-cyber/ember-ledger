import {useEffect,useState} from "react";
import {supabase} from "../supabaseClient.js";
import {INBOUND_STAGES,loadPrivateInbound,submitPrivateInbound} from "../services/warehouseInbound.mjs";
import {RETAILER_NAMES} from "../services/stockIntelligence.mjs";
import "./warehouse-inbound-panel.css";

const MAIN_STAGES=INBOUND_STAGES.filter(item=>!["delayed","unknown"].includes(item.key));
function timeLabel(value){
  const date=new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}) : "Time unknown";
}
export default function WarehouseInboundPanel({targets=[]}){
  const [isStaff,setIsStaff]=useState(false);
  const [sessionUser,setSessionUser]=useState("");
  const [events,setEvents]=useState([]);
  const [state,setState]=useState("idle");
  const [revision,setRevision]=useState(0);
  const [retailer,setRetailer]=useState("Sam's Club");
  const [sku,setSku]=useState("");
  const [stage,setStage]=useState("ordered");
  const [headline,setHeadline]=useState("");
  const [saveState,setSaveState]=useState("idle");
  const [notice,setNotice]=useState("");
  useEffect(()=>{
    if(!supabase)return undefined;
    const controller=new AbortController();
    async function check(){
      try{
        const {data:{user}={},error:userError}=await supabase.auth.getUser();
        if(userError||!user?.id||user.is_anonymous||controller.signal.aborted)return;
        const {data,error}=await supabase.from("profiles").select("app_role,user_role").eq("id",user.id).maybeSingle();
        if(error||controller.signal.aborted||data?.app_role!=="admin"||data?.user_role!=="admin")return;
        setIsStaff(true);setSessionUser(user.id);setState("loading");
        const {data:{session}={}}=await supabase.auth.getSession();
        if(!session?.access_token||session.user?.id!==user.id)throw new Error("Session expired");
        const result=await loadPrivateInbound({accessToken:session.access_token});
        if(!controller.signal.aborted){setEvents(result);setState("ready");}
      } catch {
        if(!controller.signal.aborted)setState("error");
      }
    }
    check();
    return ()=>controller.abort();
  },[revision]);
  async function submit(event){
    event.preventDefault();
    setSaveState("saving");setNotice("");
    try{
      const {data:{session}={}}=await supabase.auth.getSession();
      if(!isStaff||!session?.access_token||session.user?.id!==sessionUser)throw new Error("Staff session expired. Sign in again.");
      const result=await submitPrivateInbound({
        accessToken:session.access_token,report:{retailer,sku,stage,headline}
      });
      setSaveState("saved");setHeadline("");
      setNotice("Stage report saved privately as unverified. It expires "+timeLabel(result.expiresAt)+". No public alert or Discord ping was sent.");
      setRevision(x=>x+1);
    }catch(error){
      setSaveState("error");
      setNotice(error.message||"Could not save warehouse report.");
    }
  }
  const active=events.filter(e=>e.active);
  const products=targets.filter(item=>item.retailer===retailer);
  return <section className="warehouse-inbound" aria-label="Retailer warehouse shipment pipeline">
    <div className="warehouse-inbound__intro">
      <div><strong>Inventory journey</strong><p>From a reported order to warehouse storage and eventual retail distribution.</p></div>
      <span>Warehouse data requires authorized sources</span>
    </div>
    <ol className="warehouse-inbound__timeline">
      {MAIN_STAGES.map((item,index)=><li key={item.key}>
        <span className="warehouse-inbound__step">{index+1}</span>
        <div><strong>{item.label}</strong><p>{item.description}</p></div>
      </li>)}
    </ol>
    <div className="warehouse-inbound__notice" role="status">
      <strong>No verified retailer warehouse feeds are connected.</strong>
      <p>These stages describe what we can track; they are <em>not</em> claims that Target, Walmart, Sam's Club, Costco, or Pokémon Center has stock on the way. We cannot see their internal orders, inbound shipments, or warehouse counts without authorized data.</p>
      <p>Delayed and unknown are supported, too. Exact warehouse locations, shipment routes, quantities and vendor schedules are not shown.</p>
    </div>
    {isStaff && <details className="warehouse-inbound__staff">
      <summary>Staff-only inbound tracking {state==="ready"?"· "+active.length+" current reports":""}</summary>
      <p>Review and keep private reports of what you have evidence for. A staff-entered report is <strong>not verified retailer warehouse inventory</strong>. No public stock status or subscriber notification is generated.</p>
      <form onSubmit={submit} className="warehouse-inbound__form">
        <label>Retailer<select value={retailer} onChange={e=>{setRetailer(e.target.value);setSku("");}}>
          {RETAILER_NAMES.map(name=><option key={name} value={name}>{name}</option>)}
        </select></label>
        <label>Product / category<select value={sku} onChange={e=>setSku(e.target.value)}>
          <option value="">Category-level report (no individual SKU)</option>
          {products.map(product=><option key={product.sku} value={product.sku}>{product.name} · {product.sku}</option>)}
        </select></label>
        <label>Reported stage<select value={stage} onChange={e=>setStage(e.target.value)}>
          {INBOUND_STAGES.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}
        </select></label>
        <label className="warehouse-inbound__full">Factual report (do not include confidential shipment details)
          <input required value={headline} minLength={8} maxLength={180}
            onChange={e=>setHeadline(e.target.value)}
            placeholder="Example: Warehouse inventory reported, awaiting independent verification"/>
        </label>
        <div className="warehouse-inbound__form-actions">
          <button type="submit" disabled={saveState==="saving"}>{saveState==="saving"?"Saving…":"Save private stage report"}</button>
          <small>Private • Reported only • Automatically expires</small>
        </div>
        {notice && <p className={saveState==="error"?"warehouse-inbound__error":""} role="status">{notice}</p>}
      </form>
      <div className="warehouse-inbound__records">
        <div><strong>Staff inbound reports</strong><button type="button" onClick={()=>setRevision(x=>x+1)}>Refresh</button></div>
        {state==="loading" && <p role="status">Loading private records…</p>}
        {state==="error" && <p role="alert">Private inbound reports could not load. No stale warehouse status is shown.</p>}
        {state==="ready" && (active.length? <ul>
          {active.map(record=><li key={record.id}>
            <span>{record.retailer} · {record.product||"Category watch"}</span>
            <strong>{INBOUND_STAGES.find(x=>x.key===record.stage)?.label||"Unknown"} · {record.evidenceLevel==="verified"?"Authorized source":"Reported, not verified"}</strong>
            <p>{record.headline}</p>
            <small>Observed {timeLabel(record.observedAt)} · Expires {timeLabel(record.expiresAt)}</small>
          </li>)}
        </ul> : <p role="status">No current inbound shipment evidence recorded.</p>)}
        {state==="ready" && events.length>active.length && <small>{events.length-active.length} older report(s) have expired and are excluded from current status.</small>}
      </div>
    </details>}
  </section>;
}
