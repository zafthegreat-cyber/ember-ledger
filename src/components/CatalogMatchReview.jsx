import { useState } from "react";
import { SearchField, QuietButton, PrimaryButton } from "./operations/OperationsUI.jsx";
import CardVersionPicker from "./CardVersionPicker.jsx";
import ItemPhoto from "./ItemPhoto.jsx";
import { getItemImageUrl } from "../utils/productDisplayUtils.js";
import { setCatalogKind, setCatalogName, setCatalogNumber } from "../utils/setCatalog.mjs";
import { copyRecognition } from "../utils/collectionBrowse.mjs";
import { cardVersionOf } from "../utils/cardVersions.mjs";

export default function CatalogMatchReview({ record, entries = [], onReview, onCancel, hiddenValues = false }) {
  const [query, setQuery] = useState("");
  const [key, setKey] = useState("");
  const selected = entries.find(entry => entry.key === key && !entry.savedOnly);
  const selectedProduct = selected && selected.product.versions?.some(option => option.key === cardVersionOf(record)) ? {...selected.product,variant:record.variant || record.finish || record.priceSubtype,edition:record.edition} : selected?.product;
  const recordKind = setCatalogKind(record);
  const candidates = entries.filter(entry => !entry.savedOnly && (recordKind === "other" || entry.kind === recordKind) && (!query.trim() || `${setCatalogName(entry.product)} ${setCatalogNumber(entry.product)}`.toLowerCase().includes(query.trim().toLowerCase())));
  return <section className="catalog-match-review" aria-label="Review catalog match">
    <QuietButton onClick={onCancel}>Back to saved copies</QuietButton>
    <h3>Match your saved item</h3>
    <p><strong>{setCatalogName(record)}</strong><br />{copyRecognition(record,{hidden:hiddenValues}).title}</p>
    <p>Choose the exact product and finish. Your original record, quantity, purchase details and saved prices will be kept. Review the changes in the editor before saving.</p>
    {!selected ? <><SearchField label="Find matching catalog product" placeholder="Product name or card number" value={query} onChange={setQuery} /><p role="status">{candidates.length} known catalog matches in this set</p><ul className="catalog-match-options">{candidates.slice(0,30).map(entry => <li key={entry.key}><button type="button" onClick={() => setKey(entry.key)}><ItemPhoto src={getItemImageUrl(entry.product)} alt="" /><span><strong>{setCatalogName(entry.product)}</strong><small>{[setCatalogNumber(entry.product),entry.product.language,entry.product.variant || entry.product.finish].filter(Boolean).join(" · ")}</small></span><span aria-hidden="true">→</span></button></li>)}</ul>{candidates.length > 30 ? <p>Top 30 shown. Add a card number or more of the name to narrow the matches.</p> : null}{!candidates.length ? <p>No matching catalog entries. Try fewer words or return to edit the saved item manually.</p> : null}</> : <>
      <QuietButton onClick={() => setKey("")}>Choose a different match</QuietButton>
      <CardVersionPicker product={selectedProduct} records={[record]} quantityLabel="Saved quantity for this finish">{product => <><div className="catalog-match-comparison"><div><small>Saved item</small><strong>{setCatalogName(record)}</strong><span>{[record.cardNumber,record.language,record.edition,record.variant || record.finish].filter(Boolean).join(" · ")}</span></div><div><small>Proposed fields to review</small><strong>{setCatalogName(product)}</strong><span>{[setCatalogNumber(product),product.language,product.edition,product.variant || product.finish].filter(Boolean).join(" · ")}</span></div></div><PrimaryButton onClick={() => onReview?.(record,product)}>Review match in editor</PrimaryButton></>}</CardVersionPicker>
    </>}
  </section>;
}
