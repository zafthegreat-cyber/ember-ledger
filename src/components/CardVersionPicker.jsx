import { cardVersionLabel, cardVersionOf, cardVersionProduct, cardVersionQuantity } from "../utils/cardVersions.mjs";
import { priceMetadataLabel } from "../utils/collectionBrowse.mjs";
import { useState } from "react";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function CardVersionPicker({ product, records = [], children, quantityLabel = "You own" }) {
  const options = product.versions || [];
  const [key, setKey] = useState("");
  const chosen = options.find(option => option.key === key) || options.find(option => option.key === cardVersionOf(product)) || options[0];
  const selected = cardVersionProduct(product, chosen);
  const quantity = chosen ? cardVersionQuantity(records, chosen) : null;
  const unknown = cardVersionQuantity(records, {key:""});
  return <>
    {options.length ? <section className="card-version-picker" aria-label="Card version">
      <div className="card-version-picker__header"><h3>Version</h3>{chosen ? <span>{cardVersionLabel(chosen.variant)}</span> : null}</div>
      <div className="card-version-picker__options" role="group" aria-label="Available versions">{options.map(option => <button type="button" key={option.key} aria-pressed={chosen?.key === option.key} onClick={() => setKey(option.key)}><strong>{option.label}</strong><span>{option.marketPrice === null ? "Price unavailable" : money.format(option.marketPrice)}</span></button>)}</div>
      {chosen ? <div className="card-version-picker__summary"><span>{quantity === null ? "Quantity needs review" : `${quantityLabel} ${quantity} · ${chosen.label}`}</span><span>{priceMetadataLabel([{marketSource:chosen.source,priceCheckedAt:chosen.checkedAt}]) || "Market reference · Check date not recorded"}</span></div> : null}
      {options.length > 1 && (unknown === null || unknown > 0) ? <p>{unknown === null ? "Some saved copies have no version recorded." : `${unknown} saved ${unknown === 1 ? "copy has" : "copies have"} no version recorded.`}</p> : null}
    </section> : null}
    {children(selected)}
  </>;
}
