// Session and role checks always run with the caller's token, never the service key.
export function stockStaffAuthorizer({project,anon,fetchImpl=fetch}) {
  return async token => {
    const options={redirect:"error",signal:AbortSignal.timeout(8000),headers:{apikey:anon,Authorization:"Bearer "+token}};
    const userResponse=await fetchImpl(project+"/auth/v1/user",{...options,method:"GET"});
    if(!userResponse.ok)return null;
    const user=await userResponse.json();
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(user.id||"")||user.is_anonymous)return null;
    const roleResponse=await fetchImpl(project+"/rest/v1/rpc/is_admin",{
      ...options,method:"POST",headers:{...options.headers,"Content-Type":"application/json"},body:"{}"
    });
    if(!roleResponse.ok)return null;
    return {id:user.id,admin:(await roleResponse.json())===true};
  };
}

const productionOrigins=["https://code3tcg.app","https://code3.anchorandwingllc.com","https://code3tcg.anchorandwingllc.com","http://localhost:5173"];
// Only explicit, reviewed preview origins may be added. No *.vercel.app wildcard.
export function stockAllowedOrigins(extra=[]) {
  const result=new Set(productionOrigins);
  for(const origin of extra) {
    const url=new URL(origin);
    if(url.origin!==origin||url.protocol!=="https:"||!url.hostname.endsWith("-zafthegreat-cybers-projects.vercel.app"))
      throw new Error("Invalid stock preview origin");
    result.add(origin);
  }
  return result;
}
