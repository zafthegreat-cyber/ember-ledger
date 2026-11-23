import { lazy, Suspense } from "react";
import { listingVerdict } from "../../utils/scannerExtras.mjs";

const MarketPriceHistoryPanel = lazy(() => import("../../components/MarketPriceHistoryPanel.jsx"));
import "./scanner-extras.css";

// Scanner extras (Nov 19 2026): price check, deal check, rapid barcode batch and
// recent scans. Nothing here saves on its own; saving stays a button press.

const timeAgo = (iso) => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(minutes) || minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
};

export function DealCheck({ verdict, site = "" }) {
  if (!verdict) return null;
  return (
    <div className={`scanner-deal-check is-${verdict.tone}`} role="status">
      <span className="scanner-deal-check__eyebrow">Deal check{site ? ` · ${site}` : ""}</span>
      <strong>{verdict.label}</strong>
      <span>{verdict.detail}</span>
    </div>
  );
}

export function ScannerModeToggles({ priceCheck, onPriceCheck, rapid, onRapid, showRapid }) {
  return (
    <div className="scanner-mode-toggles">
      <button type="button" className="scanner-mode-toggle" aria-pressed={priceCheck} onClick={() => onPriceCheck(!priceCheck)}>
        <strong>Price check</strong>
        <small>{priceCheck ? "On: shows prices, saves nothing" : "Off"}</small>
      </button>
      {showRapid ? (
        <button type="button" className="scanner-mode-toggle" aria-pressed={rapid} onClick={() => onRapid(!rapid)}>
          <strong>Scan several in a row</strong>
          <small>{rapid ? "On: camera stays open" : "Off"}</small>
        </button>
      ) : null}
    </div>
  );
}

export function ScanPriceCheck({ review, product, listing, money, onAdd, onScanAnother }) {
  if (!review) return null;
  const market = Number(review.marketValue) || 0;
  const verdict = listingVerdict(listing, review.marketValue);
  const item = product || {};
  return (
    <section className="scanner-price-check" aria-labelledby="scanner-price-check-title">
      <div className="scanner-price-check__head">
        <div>
          <span className="scanner-price-check__eyebrow">Price check · nothing saved</span>
          <h3 id="scanner-price-check-title">{review.itemName}</h3>
          <p>{[review.setName, review.productType || review.catalogType].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="scanner-price-check__value">
          <small>Market</small>
          <strong>{market ? money(market) : "Unknown"}</strong>
          {review.msrp ? <small>Retail {money(review.msrp)}</small> : null}
        </div>
      </div>
      <DealCheck verdict={verdict} site={listing?.site || ""} />
      {product ? (
        <Suspense fallback={<p role="status">Loading price history…</p>}>
        <MarketPriceHistoryPanel
          compact
          marketItem={item}
          catalogProductId={item.id}
          tcgplayerProductId={item.tcgplayerProductId || item.tcgplayer_product_id}
          externalProductId={item.externalProductId || item.external_product_id}
          productName={review.itemName}
          currentMarketPrice={review.marketValue || item.marketPrice || item.midPrice}
          currentLowPrice={item.lowPrice}
          currentMidPrice={item.midPrice}
          currentHighPrice={item.highPrice}
          lastPriceChecked={item.lastPriceChecked || item.marketLastUpdated}
          money={money}
        />
        </Suspense>
      ) : null}
      <div className="scanner-price-check__actions">
        <button type="button" className="primary-button" onClick={onScanAnother}>Check another</button>
        <button type="button" className="secondary-button" onClick={onAdd}>Add this one</button>
      </div>
    </section>
  );
}

export function RapidBarcodeBatch({ batch, money, destination, onDestination, canUseBusiness, onAdjust, onRemove, onClear, onSave, saving, onReview }) {
  const items = batch.reduce((total, row) => total + row.count, 0);
  const value = batch.reduce((total, row) => total + (Number(row.marketValue) || 0) * row.count, 0);
  const unmatched = batch.filter((row) => row.status === "missing").length;
  return (
    <section className="scanner-batch" aria-labelledby="scanner-batch-title">
      <div className="scanner-batch__head">
        <h3 id="scanner-batch-title">This batch</h3>
        <span>{items} item{items === 1 ? "" : "s"}{value ? ` · about ${money(value)}` : ""}</span>
      </div>
      {!batch.length ? <p className="scanner-batch__empty">Scan barcodes one after another. Each new one is added here; the same one again adds to its count.</p> : (
        <ul className="scanner-batch__list">
          {batch.map((row) => (
            <li key={row.code} className={`scanner-batch__row is-${row.status || "looking"}`}>
              <div className="scanner-batch__copy">
                <strong>{row.itemName || (row.status === "missing" ? "Not found" : "Looking it up…")}</strong>
                <small>{row.code}{row.marketValue ? ` · ${money(row.marketValue)} each` : ""}</small>
                {row.status === "missing" ? <button type="button" className="ghost-button scanner-batch__review" onClick={() => onReview(row.code)}>Look it up by hand</button> : null}
              </div>
              <div className="scanner-batch__count" role="group" aria-label={`Count for ${row.itemName || row.code}`}>
                <button type="button" aria-label="One less" onClick={() => (row.count <= 1 ? onRemove(row.code) : onAdjust(row.code, row.count - 1))}>−</button>
                <span aria-live="polite">{row.count}</span>
                <button type="button" aria-label="One more" onClick={() => onAdjust(row.code, row.count + 1)}>+</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {batch.length ? (
        <>
          <label className="scanner-batch__destination">
            <span>Save to</span>
            <select value={destination} onChange={(event) => onDestination(event.target.value)}>
              <option value="vault">My collection</option>
              {canUseBusiness ? <option value="forge">Business inventory</option> : null}
            </select>
          </label>
          {unmatched ? <p className="scanner-batch__note">{unmatched} barcode{unmatched === 1 ? " was" : "s were"} not found and won't be saved. Look {unmatched === 1 ? "it" : "them"} up by hand.</p> : null}
          <div className="scanner-batch__actions">
            <button type="button" className="primary-button" disabled={saving || batch.every((row) => row.status !== "found")} onClick={onSave}>{saving ? "Saving…" : `Save ${batch.filter((row) => row.status === "found").reduce((total, row) => total + row.count, 0)} to ${destination === "forge" ? "inventory" : "collection"}`}</button>
            <button type="button" className="ghost-button" disabled={saving} onClick={onClear}>Clear batch</button>
          </div>
        </>
      ) : null}
    </section>
  );
}

export function RecentScans({ scans, money, onOpen, onRemove, onClear }) {
  if (!scans.length) return null;
  return (
    <details className="scanner-recent">
      <summary>Recent scans ({scans.length})</summary>
      <ul>
        {scans.map((scan) => (
          <li key={`${scan.catalogItemId}|${scan.rawValue}|${scan.at}`}>
            <button type="button" className="scanner-recent__open" onClick={() => onOpen(scan)}>
              <strong>{scan.itemName || scan.rawValue}</strong>
              <small>{[scan.marketValue ? money(scan.marketValue) : "", timeAgo(scan.at)].filter(Boolean).join(" · ")}</small>
            </button>
            <button type="button" className="ghost-button scanner-recent__remove" aria-label={`Remove ${scan.itemName || scan.rawValue} from recent scans`} onClick={() => onRemove(scan)}>Remove</button>
          </li>
        ))}
      </ul>
      <button type="button" className="ghost-button scanner-recent__clear" onClick={onClear}>Clear recent scans</button>
    </details>
  );
}

