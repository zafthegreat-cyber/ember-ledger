import { createEbayNotificationRuntimeHandler } from "./handler.ts";

// This function must be deployed with verify_jwt=false because eBay supplies an ECC
// signature, not a Supabase user JWT. /status and /retry separately require the server service key.
const env = Object.fromEntries([
  "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "EBAY_DELETION_VERIFICATION_TOKEN", "EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET",
].map(name => [name, Deno.env.get(name)]));

Deno.serve(createEbayNotificationRuntimeHandler({ env, fetchImpl: (url, init) => fetch(url, init) }));
