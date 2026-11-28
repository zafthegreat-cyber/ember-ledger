import {
  parseApprovedSourceConfig,createStockSourceDependencies,createStockSourceHandler
} from "./core.mjs";

// No sources are activated by default. Provision encrypted Edge secrets only
// after source access, permitted publication, and a real health check are approved.
// Signed server-to-server authentication replaces gateway JWT auth for this endpoint.
const registrations=parseApprovedSourceConfig(
  Deno.env.get("CODE3_STOCK_APPROVED_SOURCE_CONFIG"),
  name=>Deno.env.get(name)||""
);
const dependencies=createStockSourceDependencies({
  project:Deno.env.get("SUPABASE_URL"),
  serviceKey:Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
});
Deno.serve(createStockSourceHandler({registrations,...dependencies}));
