const FIELDS = Object.freeze({
  marketPrice: { local:["marketPrice","marketValue","market_price","market_value"], server:["market_price","market_value"] },
  lowPrice: { local:["lowPrice","low_price"], server:["low_price"] },
  midPrice: { local:["midPrice","mid_price"], server:["mid_price"] },
  highPrice: { local:["highPrice","high_price"], server:["high_price"] },
  msrpPrice: { local:["msrpPrice","msrp","msrp_price"], server:["msrp_price","msrp"] },
});
const METADATA = Object.freeze(["lastPriceChecked","last_price_checked","priceCheckedAt","price_checked_at","marketLastUpdated","market_last_updated","priceUpdatedAt","price_updated_at","marketValueUpdatedAt","market_value_updated_at","marketSource","marketValueSource","market_value_source","priceSource","marketStatus","manualPriceUpdatedAt"]);
function amount(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value.trim()))) return NaN;
  const result=Number(value); return Number.isFinite(result) && result >= 0 ? result : NaN;
}
function restore(target,current,keys) {
  for(const key of keys) { if(Object.hasOwn(current,key))target[key]=current[key];else delete target[key]; }
}

/** Pure edit reconciliation. `baseline` is the form snapshot at edit start;
 * `current` is the latest original record at Save, not the original snapshot.
 * Unchanged inputs cannot write stale quotes over a refresh that arrived while
 * the form was open. Manual edits never advance provider check timestamps. */
export function reconcileLegacyQuoteEdit({baseline={},current={},draft={},localUpdate={},serverUpdate={},reviewedAt=""}={}) {
  const local={...localUpdate},server={...serverUpdate},changedFields=[];
  restore(local,current,METADATA);
  for(const key of METADATA)delete server[key];
  for(const [field,keys] of Object.entries(FIELDS)) {
    const before=amount(baseline[field]),after=Object.hasOwn(draft,field)?amount(draft[field]):before;
    const changed=!Object.is(before,after);
    for(const key of keys.server)delete server[key];
    if(!changed){restore(local,current,keys.local);continue;}
    if(Number.isNaN(after))throw new Error(`Enter a valid nonnegative value for ${field}.`);
    changedFields.push(field);
    for(const key of keys.local)if(Object.hasOwn(current,key)||Object.hasOwn(localUpdate,key)||key===field)local[key]=after;
    // Use the primary column accepted by the existing inventory editor. Do not
    // add aliases to the database payload just because they exist locally.
    server[keys.server[0]]=after;
    if(field === "marketPrice")server.market_value=after;
  }
  if(changedFields.includes("marketPrice")) {
    local.marketValue=local.marketPrice;
    local.marketValueSource="manual";local.market_value_source="manual";local.marketSource="Manual saved estimate";local.marketStatus="manual";
    server.market_value_source="manual";
    if(reviewedAt && Number.isFinite(Date.parse(reviewedAt))) {
      local.manualPriceUpdatedAt=reviewedAt;local.marketValueUpdatedAt=reviewedAt;local.market_value_updated_at=reviewedAt;
      server.market_value_updated_at=reviewedAt;
    }
  }
  return {localUpdate:local,serverUpdate:server,changedFields};
}
