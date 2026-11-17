import {useEffect,useState} from "react";
import {supabase} from "../supabaseClient.js";
import {RETAILER_NAMES,SIGNAL_KINDS,submitStockReview} from "../services/stockIntelligence.mjs";
import "./stock-signal-review.css";

export default function StockSignalReview({targets=[],onPublished}) {
  const [admin,setAdmin]=useState(false);
  const [actor,setActor]=useState("");
  const [retailer,setRetailer]=useState("Target");
  const [sku,setSku]=useState("");
  const [signalType,setSignalType]=useState("reported_stock");
  const [evidence,setEvidence]=useState("reported");
  const [headline,setHeadline]=useState("");
  const [sourceUrl,setSourceUrl]=useState("");
  const [state,setState]=useState("idle");
  const [message,setMessage]=useState("");
  useEffect(()=>{
    if (!supabase) return undefined;
    let mounted=true;
    async function check() {
      try {
        const {data:{user}={},error:userError}=await supabase.auth.getUser();
        if (userError || !user?.id || user.is_anonymous) return;
        const {data,error}=await supabase.from("profiles").select("app_role,user_role").eq("id",user.id).maybeSingle();
        if (mounted && !error && data?.app_role==="admin" && data?.user_role==="admin") {
          setActor(user.id);setAdmin(true);
        }
      } catch {/* No staff tools without verified authorization. */}
    }
    check();
    return ()=>{mounted=false;};
  },[]);
  if (!admin) return null;
  const choices=targets.filter(p=>p.retailer===retailer);
  function selectProduct(value) {
    setSku(value);
    const product=choices.find(p=>p.sku===value);
    if(product) setSourceUrl(product.url);
  }
  async function publish(event) {
    event.preventDefault();
    setState("saving");setMessage("");
    try {
      const {data:{session}={}}=await supabase.auth.getSession();
      if (!session?.access_token || session.user?.id!==actor) throw new Error("Admin session expired. Sign in again.");
      const result=await submitStockReview({accessToken:session.access_token,
        review:{retailer,sku,signalType,evidence,headline,sourceUrl}});
      setState("saved");
      setMessage("Reviewed signal saved. Expires "+new Date(result.expiresAt).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})+". No Discord notification was sent.");
      setHeadline("");onPublished?.();
    } catch(error) {
      setState("error");setMessage(error.message||"Could not submit signal.");
    }
  }
  return <details className="stock-review">
    <summary>Staff tools · Review a stock lead</summary>
    <p>Publish one time-limited, attributed signal into Find → Restocks. Use <strong>Admin-checked</strong> only after checking the matching retailer page yourself. Do not repost private Discord content without permission.</p>
    <form onSubmit={publish}>
      <div className="stock-review__fields">
        <label>Retailer<select value={retailer} onChange={event=>{setRetailer(event.target.value);setSku("");setSourceUrl("");}}>
          {RETAILER_NAMES.map(name=><option value={name} key={name}>{name}</option>)}
        </select></label>
        <label>Product on watch<select value={sku} onChange={event=>selectProduct(event.target.value)}>
          <option value="">No SKU · Queue, raffle, possible drop</option>
          {choices.map(p=><option key={p.sku} value={p.sku}>{p.name+" · "+p.sku}</option>)}
        </select></label>
        <label>Signal type<select value={signalType} onChange={event=>setSignalType(event.target.value)}>
          {Object.entries(SIGNAL_KINDS).map(([id,info])=><option key={id} value={id}>{info.label}</option>)}
        </select></label>
        <label>Verification<select value={evidence} onChange={event=>setEvidence(event.target.value)}>
          <option value="reported">Reported · Not verified as live</option>
          <option value="admin_checked">Admin-checked retailer page</option>
        </select></label>
        <label className="stock-review__wide">Short factual headline
          <input required minLength={8} maxLength={180} value={headline} onChange={event=>setHeadline(event.target.value)} placeholder="Example: Queue appeared at Pokémon Center"/>
        </label>
        <label className="stock-review__wide">Original retailer or permitted Discord message link
          <input required type="url" value={sourceUrl} onChange={event=>setSourceUrl(event.target.value)} placeholder="https://..." />
        </label>
      </div>
      <div className="stock-review__actions">
        <button type="submit" disabled={state==="saving"}>{state==="saving"?"Saving…":"Review and publish"}</button>
        <small>Staff-only. No automatic checkout or Discord mass-ping.</small>
      </div>
      {message && <p role="status" className={state==="error"?"stock-review__error":""}>{message}</p>}
    </form>
  </details>;
}
