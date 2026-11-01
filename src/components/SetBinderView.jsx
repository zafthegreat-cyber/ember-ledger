import { useState } from "react";
import { PrivateStorageImage } from "./PrivateReceipt.jsx";
import "./set-binder-view.css";

// #21: a binder view for a set. Nine-pocket pages in card-number order, with
// owned cards shown and missing numbers as empty pockets. Pure presentation:
// the rows come from buildSetCardRows and the actions from the set detail.

export const BINDER_POCKETS_PER_PAGE = 9;

function buildBinderPages(rows = [], pocketsPerPage = BINDER_POCKETS_PER_PAGE) {
  const ordered = [...(Array.isArray(rows) ? rows : [])];
  const pages = [];
  for (let index = 0; index < ordered.length; index += pocketsPerPage) {
    const pocketRows = ordered.slice(index, index + pocketsPerPage);
    while (pocketRows.length < pocketsPerPage) pocketRows.push(null);
    pages.push({ number: pages.length + 1, pockets: pocketRows });
  }
  return pages.length ? pages : [{ number: 1, pockets: Array.from({ length: pocketsPerPage }, () => null) }];
}

export default function SetBinderView({ rows = [], setName = "", imageFor, onOpen, onAddOwned, onAddWishlist }) {
  const pages = buildBinderPages(rows);
  const [pageIndex, setPageIndex] = useState(0);
  const safeIndex = Math.min(pageIndex, pages.length - 1);
  const page = pages[safeIndex];
  const owned = rows.filter((row) => row && row.ownedQuantity > 0).length;
  const missing = rows.filter((row) => row && row.missing).length;
  return (
    <section className="set-binder" aria-label={`${setName || "Set"} binder view`}>
      <div className="set-binder-toolbar">
        <div>
          <strong>Binder: {setName || "Set"}</strong>
          <small>{owned} owned · {missing} missing · {rows.length} pockets in card-number order</small>
        </div>
        <div className="set-binder-pager" role="group" aria-label="Binder pages">
          <button type="button" className="secondary-button" onClick={() => setPageIndex(Math.max(0, safeIndex - 1))} disabled={safeIndex === 0} aria-label="Previous page">‹</button>
          <span aria-live="polite">Page {page.number} of {pages.length}</span>
          <button type="button" className="secondary-button" onClick={() => setPageIndex(Math.min(pages.length - 1, safeIndex + 1))} disabled={safeIndex >= pages.length - 1} aria-label="Next page">›</button>
        </div>
      </div>
      <div className="set-binder-page">
        {page.pockets.map((row, index) => {
          if (!row) return <div className="set-binder-pocket set-binder-pocket--empty" key={`empty-${page.number}-${index}`} aria-hidden="true" />;
          const image = typeof imageFor === "function" ? imageFor(row) : "";
          const status = row.ownedQuantity > 0 ? "owned" : row.wishlistQuantity > 0 ? "wishlist" : row.missing ? "missing" : "tracked";
          const label = row.cardNumber ? `#${row.cardNumber}` : "";
          return (
            <article className={`set-binder-pocket set-binder-pocket--${status}`} key={row.key || `${page.number}-${index}`}>
              <button type="button" className="set-binder-card" onClick={() => onOpen?.(row)} aria-label={`${row.title || "Card"} ${label} ${status}`}>
                {image && status === "owned" ? (
                  <PrivateStorageImage src={image} alt="" />
                ) : (
                  <span className="set-binder-placeholder">
                    <strong>{label || "?"}</strong>
                    <small>{status === "owned" ? "Owned" : status === "wishlist" ? "Wishlist" : status === "missing" ? "Missing" : "Tracked"}</small>
                  </span>
                )}
              </button>
              <div className="set-binder-caption">
                <span>{label}</span>
                <strong title={row.title}>{row.title}</strong>
                {status !== "owned" ? (
                  <div className="set-binder-actions">
                    <button type="button" onClick={() => onAddOwned?.(row)}>Got it</button>
                    {status !== "wishlist" ? <button type="button" onClick={() => onAddWishlist?.(row)}>Want</button> : null}
                  </div>
                ) : (
                  <small>{row.ownedQuantity} owned</small>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
