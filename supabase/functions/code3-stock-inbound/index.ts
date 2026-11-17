import {createInboundHandler,createInboundDependencies} from "./core.mjs";
const options={
  project:Deno.env.get("SUPABASE_URL"),
  key:Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  anon:Deno.env.get("SUPABASE_ANON_KEY")
};
const deps=createInboundDependencies(options);
Deno.serve(createInboundHandler(deps));
