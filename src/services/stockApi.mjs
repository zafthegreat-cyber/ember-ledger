import {stockProjectOrigin} from "../../supabase/functions/_shared/stockProject.mjs";

// Match the Auth client's project. Missing configuration must never fall back
// to a shared backend when a staging session is being used.
export function stockApiUrl(name,project=import.meta.env?.VITE_SUPABASE_URL) {
  return stockProjectOrigin(project)+"/functions/v1/"+name;
}
