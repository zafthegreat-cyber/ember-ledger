const FIELDS = Object.freeze({
  marketKind: "catalogKindFilter",
  marketSet: "catalogSetFilter",
  marketType: "catalogTypeFilter",
  marketData: "catalogDataFilter",
});
const clean = value => String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 140);

/** Shared URLs are authoritative, including an explicitly empty search. */
export function readMarketSearchRoute(search = "") {
  const params = new URLSearchParams(search);
  const query = clean(params.get("q"));
  const state = { catalogSearch: query, submittedCatalogSearch: query };
  for (const [param, field] of Object.entries(FIELDS)) state[field] = clean(params.get(param)) || "All";
  if (!["All", "card", "sealed", "other"].includes(state.catalogKindFilter)) state.catalogKindFilter = "All";
  if (!["All", "Has market price", "Missing price", "Has image"].includes(state.catalogDataFilter)) state.catalogDataFilter = "All";
  return state;
}

export function writeMarketSearchRoute(params, state, enabled) {
  ["q", ...Object.keys(FIELDS)].forEach(key => params.delete(key));
  if (!enabled) return params;
  const query = clean(state.catalogSearch);
  if (query) params.set("q", query);
  for (const [param, field] of Object.entries(FIELDS)) {
    const value = clean(state[field]);
    if (value && value !== "All") params.set(param, value);
  }
  return params;
}
