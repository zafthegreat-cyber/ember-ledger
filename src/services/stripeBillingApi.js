import { getOwnerRequestHeaders } from "./ownerSession.js";
import { getApiBase, isNativePlatform } from "../native/nativeRuntime.js";

async function request(path, body) {
  if (isNativePlatform()) throw new Error("Sandbox checkout is currently available on the website.");
  const authorization = await getOwnerRequestHeaders();
  if (!authorization.Authorization) throw new Error("Sign in with a verified email to use sandbox billing.");
  const response = await fetch(`${getApiBase()}/api/billing/${path}`, {
    method: body === undefined ? "GET" : "POST", cache: "no-store", credentials: "omit",
    headers: { Accept: "application/json", ...authorization, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = (response.headers.get("content-type") || "").includes("application/json") ? await response.json() : null;
  if (!response.ok || !payload) throw new Error(payload?.error?.message || "Sandbox billing is unavailable.");
  return payload;
}

export const getStripeBillingStatus = () => request("status");
export const createStripeCheckout = (offerId, attemptId) => request("checkout", { offerId, attemptId });
export const createStripePortal = () => request("portal", {});

export function openStripeBillingUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !["checkout.stripe.com", "billing.stripe.com"].includes(url.hostname)
    || url.username || url.password || url.port) throw new Error("Unexpected billing destination.");
  globalThis.location.assign(url.href);
}
