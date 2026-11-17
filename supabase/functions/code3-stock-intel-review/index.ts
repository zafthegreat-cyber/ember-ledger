import {createReviewHandler,createDependencies} from './core.mjs';
const params={
  project:Deno.env.get('SUPABASE_URL'),
  key:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  anon:Deno.env.get('SUPABASE_ANON_KEY'),
};
Deno.serve(createReviewHandler(createDependencies(params)));
