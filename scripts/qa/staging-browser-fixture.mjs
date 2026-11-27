// Offline rehearsal of the test runner. Not real Auth evidence; never deployed.
import {randomUUID} from "node:crypto";
export function stagingBrowserFixture(config){
  const users=new Map(),sessions=new Map(),preferences=new Map(),events=[];
  const jwt=claims=>Buffer.from(JSON.stringify({alg:"HS256",typ:"JWT"})).toString("base64url")+"."+Buffer.from(JSON.stringify(claims)).toString("base64url")+".offline-fixture-signature";
  const body=(status,data)=>({status,data});
  function request(url,method,headers,input,administrator=false){
    const path=url.pathname,authorization=new Headers(headers).get("authorization")?.replace(/^Bearer /u,"");
    const actor=users.get(sessions.get(authorization));
    const staff=actor&&["owner","admin"].includes(actor.app_role);
    if(administrator){
      if(new Headers(headers).get("apikey")!==config.service)throw new Error("Fixture administrator key mismatch");
      if(path==="/auth/v1/admin/users"&&method==="POST"){
        const user={id:randomUUID(),email:input.email,password:input.password,app_role:"user",user_role:"user"};users.set(user.id,user);return body(200,{id:user.id});
      }
      if(path.startsWith("/auth/v1/admin/users/")&&method==="DELETE"){users.delete(path.split("/").at(-1));return body(204,null);}
      if(path==="/rest/v1/profiles"&&method==="PATCH"){Object.assign(users.get(url.searchParams.get("id").slice(3)),input);return body(204,null);}
      throw new Error("Unexpected fixture administrator request");
    }
    if(path==="/auth/v1/token"){
      const user=[...users.values()].find(u=>u.email===input.email&&u.password===input.password);
      if(!user)return body(400,{message:"Invalid credentials"});
      const token=jwt({sub:user.id,ref:config.ref,role:"authenticated",iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,session_id:randomUUID()});sessions.set(token,user.id);
      return body(200,{access_token:token,token_type:"bearer",expires_in:3600,refresh_token:randomUUID(),user:{id:user.id,email:user.email,aud:"authenticated",role:"authenticated",is_anonymous:false,app_metadata:{provider:"email",providers:["email"]},user_metadata:{},created_at:new Date().toISOString()}});
    }
    if(path==="/auth/v1/logout"){sessions.delete(authorization);return body(204,null);}
    if(path==="/auth/v1/user")return actor?body(200,{id:actor.id,email:actor.email,is_anonymous:false,app_metadata:{},user_metadata:{}}):body(401,{message:"Signed out"});
    if(path==="/rest/v1/rpc/is_admin")return body(200,Boolean(staff));
    if(path==="/rest/v1/profiles")return body(200,actor?[{app_role:actor.app_role,user_role:actor.user_role}]:[]);
    if(path==="/rest/v1/stock_alert_preferences"){
      if(!actor)return body(401,{message:"Sign in required"});
      if(method==="POST"){if(input.user_id!==actor.id)return body(403,{});preferences.set(actor.id,input);return body(201,null);}
      if(method==="DELETE"){preferences.delete(actor.id);return body(204,null);}
      return body(200,preferences.has(actor.id)?[preferences.get(actor.id)]:[]);
    }
    if(path==="/functions/v1/code3-stock-inbound"){
      if(!staff)return body(403,{error:"Staff access required"});
      if(method==="GET")return body(200,{version:1,events});
      const event={id:randomUUID(),retailer:input.retailer,stage:input.stage,headline:input.headline,evidenceLevel:"reported",sourceType:"staff_report",observedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),sku:"",product:""};events.push(event);
      return body(201,{ok:true,id:event.id,expiresAt:event.expiresAt});
    }
    throw new Error("Unexpected offline fixture route: "+path);
  }
  return {
    remainingUsers:()=>users.size,
    adminFetch:async(url,opts)=>{const r=request(new URL(url),opts.method,opts.headers,opts.body?JSON.parse(opts.body):null,true);return new Response(r.status===204?null:JSON.stringify(r.data),{status:r.status,headers:{"Content-Type":"application/json"}});},
    routeStaging:async route=>{
      const req=route.request();let input=null;try{input=req.postDataJSON();}catch{}
      const r=request(new URL(req.url()),req.method(),req.headers(),input);
      return route.fulfill({status:r.status,contentType:"application/json",headers:{"Access-Control-Allow-Origin":"http://localhost:5173","Access-Control-Allow-Headers":"*"},body:r.status===204?"":JSON.stringify(r.data)});
    }
  };
}
