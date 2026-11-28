// Require a canonical hosted Supabase origin before attaching any credentials.
export function stockProjectOrigin(value) {
  if(typeof value!=="string"||!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(value))
    throw new Error("Stock project configuration unavailable");
  return value;
}
