import {useEffect,useState} from "react";
import {supabase} from "../supabaseClient.js";
import {
  STOCK_ALERT_RETAILERS,STOCK_ALERT_SIGNAL_OPTIONS,
  defaultStockAlertPreferences,normalizeStockAlertPreferences
} from "../services/stockAlertPreferences.mjs";
import "./stock-alert-preferences.css";

function deviceZone(){
  try{return Intl.DateTimeFormat().resolvedOptions().timeZone||"America/New_York";}
  catch{return "America/New_York";}
}
const columns="enabled,retailers,signal_types,product_keys,quiet_hours_enabled,quiet_start,quiet_end,time_zone";
export default function StockAlertPreferences({targets=[]}){
  const [account,setAccount]=useState("");
  const [phase,setPhase]=useState("loading");
  const [settings,setSettings]=useState(()=>defaultStockAlertPreferences(deviceZone()));
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState("");
  useEffect(()=>{
    if(!supabase){setPhase("unavailable");return undefined;}
    let active=true;
    async function load(){
      setPhase("loading");
      try{
        const auth=await supabase.auth.getSession();
        if(!auth.data?.session?.access_token){
          if(active){setAccount("");setPhase("guest");}
          return;
        }
        const verified=await supabase.auth.getUser(auth.data.session.access_token);
        const user=verified.data?.user;
        if(verified.error||!user?.id||user.is_anonymous){
          if(active){setAccount("");setPhase("guest");}
          return;
        }
        const res=await supabase.from("stock_alert_preferences")
          .select(columns).eq("user_id",user.id).maybeSingle();
        if(res.error)throw new Error("Watch preferences are not available in this preview.");
        if(active){
          setAccount(user.id);
          setSettings(res.data?{...defaultStockAlertPreferences(deviceZone()),...res.data}:defaultStockAlertPreferences(deviceZone()));
          setPhase("ready");
        }
      }catch{
        if(active){setAccount("");setPhase("unavailable");}
      }
    }
    load();
    const {data:{subscription}={}}=supabase.auth.onAuthStateChange(event=>{
      if(!active)return;
      if(event==="SIGNED_OUT"){
        setAccount("");setSettings(defaultStockAlertPreferences(deviceZone()));
        setNotice("");setPhase("guest");
      }
    });
    return ()=>{active=false;subscription?.unsubscribe();};
  },[]);
  function setField(name,value){setSettings(current=>({...current,[name]:value}));setNotice("");}
  function toggleArray(name,value){
    setSettings(current=>{
      const old=Array.isArray(current[name])?current[name]:[];
      const next=old.includes(value)?old.filter(x=>x!==value):[...old,value];
      const draft={...current,[name]:next};
      if(name==="retailers")draft.product_keys=current.product_keys.filter(key=>next.some(retailer=>key.startsWith(retailer+"|")));
      return draft;
    });
    setNotice("");
  }
  async function validSession(){
    if(!supabase||!account)throw new Error("Sign in to save preferences.");
    const {data:{session}={}}=await supabase.auth.getSession();
    if(!session?.access_token||session.user?.id!==account)throw new Error("Your session changed. Please sign in again.");
    const verified=await supabase.auth.getUser(session.access_token);
    if(verified.error||verified.data?.user?.id!==account||verified.data.user.is_anonymous)
      throw new Error("Your session could not be verified.");
    return account;
  }
  async function save(event){
    event.preventDefault();
    setSaving(true);setNotice("");
    try{
      const next=normalizeStockAlertPreferences(settings,{targets,timeZone:deviceZone()});
      const user_id=await validSession();
      const result=await supabase.from("stock_alert_preferences")
        .upsert({user_id,...next,updated_at:new Date().toISOString()},{onConflict:"user_id"});
      if(result.error)throw new Error("Preferences could not be saved. No alerts were enabled.");
      setSettings(next);
      setNotice("Saved to your account. Alert delivery is NOT active yet; this only prepares your preferences.");
    }catch(error){setNotice(error.message||"Couldn't save preferences.");}
    finally{setSaving(false);}
  }
  async function remove(){
    setSaving(true);setNotice("");
    try{
      const user_id=await validSession();
      const result=await supabase.from("stock_alert_preferences").delete().eq("user_id",user_id);
      if(result.error)throw new Error("Could not remove your preferences.");
      setSettings(defaultStockAlertPreferences(deviceZone()));
      setNotice("Your saved watch preferences have been cleared.");
    }catch(error){setNotice(error.message||"Couldn't clear preferences.");}
    finally{setSaving(false);}
  }
  const products=targets.filter(item=>settings.retailers.includes(item.retailer));
  return <section className="stock-alert-preferences" aria-label="Stock alert preferences">
    <div className="stock-alert-preferences__heading">
      <strong>Personal alert choices</strong>
      <p>Choose what you'd like to follow when verified alerts become available.</p>
    </div>
    <div className="stock-alert-preferences__notice" role="status">
      <strong>Delivery is not connected yet.</strong>
      <p>Saving these choices does not activate push notifications, Discord pings, or email. Only authorized, verified sources can power future delivery.</p>
    </div>
    {phase==="loading" && <p role="status">Checking your saved preferences…</p>}
    {phase==="guest" && <p role="status">Sign in to Code 3 TCG to save watch preferences to your account.</p>}
    {phase==="unavailable" && <p role="alert">Account watch preferences aren't available in this build. Nothing was saved or enabled.</p>}
    {phase==="ready" && <form onSubmit={save}>
      <label className="stock-alert-preferences__primary">
        <input type="checkbox" checked={settings.enabled} onChange={e=>setField("enabled",e.target.checked)}/>
        <span><strong>Save my future alert opt-in</strong><small>This records consent only. No messages are sent until delivery launches.</small></span>
      </label>
      <fieldset>
        <legend>Retailers to follow</legend>
        <div className="stock-alert-preferences__choices">
          {STOCK_ALERT_RETAILERS.map(name=><label key={name}>
            <input type="checkbox" checked={settings.retailers.includes(name)}
              onChange={()=>toggleArray("retailers",name)}/>{name}
          </label>)}
        </div>
      </fieldset>
      <fieldset>
        <legend>Which signals matter?</legend>
        <div className="stock-alert-preferences__choices">
          {STOCK_ALERT_SIGNAL_OPTIONS.map(item=><label key={item.key}>
            <input type="checkbox" checked={settings.signal_types.includes(item.key)}
              onChange={()=>toggleArray("signal_types",item.key)}/>{item.label}
          </label>)}
        </div>
        <small>Possible drops and community inventory are unverified; a queue isn't proof of a product release.</small>
      </fieldset>
      <details className="stock-alert-preferences__products">
        <summary>Specific products (optional) · {settings.product_keys.length} selected</summary>
        <p>Leave all unchecked to follow any product at the selected retailers. Choosing items restricts alerts to those SKUs.</p>
        {products.length?<div className="stock-alert-preferences__product-list">
          {products.map(item=>{
            const id=item.retailer+"|"+item.sku;
            return <label key={id}>
              <input type="checkbox" checked={settings.product_keys.includes(id)}
                onChange={()=>toggleArray("product_keys",id)}/>
              <span>{item.name}<small>{item.retailer} · SKU {item.sku}</small></span>
            </label>;
          })}
        </div>:<p>No individual products currently registered for those retailers.</p>}
      </details>
      <fieldset>
        <legend>Quiet hours</legend>
        <label className="stock-alert-preferences__quiet-toggle">
          <input type="checkbox" checked={settings.quiet_hours_enabled}
            onChange={e=>setField("quiet_hours_enabled",e.target.checked)}/>
          Hold future notifications during these times
        </label>
        {settings.quiet_hours_enabled&&<div className="stock-alert-preferences__time-row">
          <label>From<input type="time" value={settings.quiet_start||"22:00"} onChange={e=>setField("quiet_start",e.target.value)}/></label>
          <label>Until<input type="time" value={settings.quiet_end||"08:00"} onChange={e=>setField("quiet_end",e.target.value)}/></label>
        </div>}
        <small>Time zone: {settings.time_zone||deviceZone()}. This is preference data, not active scheduling.</small>
      </fieldset>
      <div className="stock-alert-preferences__actions">
        <button type="submit" disabled={saving}>{saving?"Saving…":"Save preferences"}</button>
        <button type="button" className="stock-alert-preferences__clear" disabled={saving} onClick={remove}>Clear my preferences</button>
      </div>
      {notice&&<p className="stock-alert-preferences__feedback" role="status">{notice}</p>}
    </form>}
  </section>;
}