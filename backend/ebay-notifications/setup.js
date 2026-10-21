"use strict";
(() => {
  let config, accessToken;
  const byId = (id) => document.getElementById(id);
  const say = (text) => { byId("status").textContent = text; };
  const rpc = async (name, body = {}) => {
    const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${name}`, { method:"POST",redirect:"error",cache:"no-store",headers:{apikey:config.publishableKey,Authorization:`Bearer ${accessToken}`,"Content-Type":"application/json"},body:JSON.stringify(body) });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "This setup is restricted to the publisher's current signed-in app account." : "The setup service is unavailable. No success has been recorded.");
    return response.json();
  };
  const clear = () => { accessToken=undefined; for(const id of ["password","token","appId","certId"])byId(id).value="";byId("token").type="password";byId("toggleToken").textContent="Show token";byId("toggleToken").setAttribute("aria-pressed","false");byId("delivery").textContent="";byId("setup").hidden=true;byId("login").hidden=false; };
  byId("loginForm").addEventListener("submit",async(event)=>{
    event.preventDefault();byId("signIn").disabled=true;say("Signing in…");
    try{
      const response=await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`,{method:"POST",redirect:"error",cache:"no-store",headers:{apikey:config.publishableKey,"Content-Type":"application/json"},body:JSON.stringify({email:byId("email").value.trim(),password:byId("password").value})});
      byId("password").value="";
      if(!response.ok)throw new Error("Sign-in failed. Check your usual Code 3 TCG app login.");
      const session=await response.json();accessToken=session.access_token;
      const info=await rpc("code3_ebay_setup_info");byId("endpoint").value=info.endpoint;byId("token").value=info.verificationToken;byId("configured").textContent=info.credentialsConfigured?"Server credentials are configured.":"Server credentials have not been configured yet.";
      byId("login").hidden=true;byId("setup").hidden=false;say("Publisher verified. Copy the endpoint and token into eBay.");
    }catch(error){clear();say(error.message||"Setup unavailable.");}finally{byId("signIn").disabled=false;}
  });
  for(const [button,field,label] of [["copyEndpoint","endpoint","Endpoint"],["copyToken","token","Verification token"]])byId(button).addEventListener("click",async()=>{try{await navigator.clipboard.writeText(byId(field).value);say(`${label} copied. Paste it into the matching eBay field.`);}catch{say(field==="token"?"Clipboard unavailable. Choose Show token, then select and copy it manually. Hide it when finished.":"Clipboard unavailable. Select and copy the endpoint field manually.");}});
  byId("toggleToken").addEventListener("click",()=>{const show=byId("token").type==="password";byId("token").type=show?"text":"password";byId("toggleToken").textContent=show?"Hide token":"Show token";byId("toggleToken").setAttribute("aria-pressed",String(show));say(show?"Verification token is visible. Keep it out of screenshots and hide it when finished.":"Verification token hidden.");});
  byId("keysForm").addEventListener("submit",async(event)=>{event.preventDefault();byId("saveKeys").disabled=true;try{await rpc("code3_ebay_configure_credentials",{p_client_id:byId("appId").value.trim(),p_client_secret:byId("certId").value.trim()});byId("appId").value="";byId("certId").value="";byId("configured").textContent="Server credentials are configured.";say("Saved to encrypted server storage. Wait 30 seconds, then send eBay's test notification.");}catch(error){say(error.message);}finally{byId("saveKeys").disabled=false;}});
  byId("refreshStatus").addEventListener("click",async()=>{try{const result=await rpc("code3_ebay_setup_status");byId("delivery").textContent=`Received: ${result.received}. Processed: ${result.processed}. Pending: ${result.pending}. Needs review: ${result.needsReview}. Failed: ${result.failed}. A test account that does not match saved data can correctly require review; receipt is not proof of completed erasure.`;}catch(error){say(error.message);}});
  byId("signOut").addEventListener("click",async()=>{const oldToken=accessToken;clear();if(oldToken)try{await fetch(`${config.supabaseUrl}/auth/v1/logout?scope=local`,{method:"POST",redirect:"error",headers:{apikey:config.publishableKey,Authorization:`Bearer ${oldToken}`}});}catch{}say("Signed out. Token and credentials cleared from this page.");});
  addEventListener("pagehide",clear);
  fetch("/public-config.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(value=>{if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(value.supabaseUrl)||typeof value.publishableKey!=="string")throw new Error();config=value;say("Ready. Sign in with your existing Code 3 TCG app account.");}).catch(()=>say("The local setup configuration is unavailable."));
})();
