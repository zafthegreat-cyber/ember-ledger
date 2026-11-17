import {createStockIntelHandler,fetchStockIntel} from './core.mjs';
const project = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
Deno.serve(createStockIntelHandler({
  load: async () => fetchStockIntel({project, key: serviceKey}),
}));
