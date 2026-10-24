import { useId, useState } from "react";
import { PrivateStorageImage } from "./PrivateReceipt.jsx";
import { preserveLegacyReportZeros } from "../utils/restockDetailItems.mjs";
import "./restock-report-details.css";

function savedText(value) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function savedCatalogImage(snapshot = {}) {
  return savedText(snapshot.imageUrl || snapshot.image_url || snapshot.image || snapshot.images?.small || snapshot.images?.large);
}

function ReportImage({ src, alt, reference = false }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  return (
    <div className={`scout-report-details__image${reference ? " scout-report-details__image--reference" : ""}`}>
      {failed || !src ? (
        <div className="scout-report-details__image-fallback">
          <span>{reference ? "Reference image unavailable" : "Photo unavailable"}</span>
          {!reference ? <small>The saved photo reference is retained.</small> : null}
          {src ? <button type="button" className="secondary-button" onClick={() => { setAttempt((value) => value + 1); setFailed(false); }}>Retry {reference ? "image" : "photo"}</button> : null}
        </div>
      ) : (
        <PrivateStorageImage key={attempt} src={src} alt={alt} authorizePrivate={!reference} loading="lazy" onError={() => setFailed(true)} />
      )}
    </div>
  );
}

function ItemDetails({ item, index, money }) {
  const snapshot = item.catalogProductSnapshot || item.catalog_product_snapshot || {};
  const name = savedText(item.productName || snapshot.name || snapshot.productName || snapshot.cardName || snapshot.title) || `Item ${index + 1}`;
  const quantity = savedText(item.quantity);
  const rawPrice = savedText(item.price);
  const numericPrice = Number(rawPrice);
  const price = rawPrice && Number.isFinite(numericPrice) && numericPrice > 0
    ? money(numericPrice)
    : rawPrice || "Price not added";
  const note = savedText(item.note || item.notes);
  const referenceImage = savedCatalogImage(snapshot);
  const productType = savedText(item.productType || snapshot.productType || snapshot.product_type);

  return (
    <li className="scout-report-detail-item scout-report-details__item">
      <div className="scout-report-details__item-copy">
        <strong>{name}</strong>
        {productType ? <span className="scout-report-details__muted">{productType}</span> : null}
        <dl className="scout-report-details__item-facts">
          <div><dt>Quantity reported</dt><dd>{quantity || "Not added"}</dd></div>
          <div><dt>Price reported</dt><dd>{price}</dd></div>
        </dl>
        {note ? <p className="scout-report-details__saved-note">{note}</p> : null}
      </div>
      {referenceImage ? (
        <figure className="scout-report-details__reference">
          <ReportImage key={referenceImage} src={referenceImage} alt={`Catalog reference for ${name}`} reference />
          <figcaption>Catalog reference<br />Not observation proof</figcaption>
        </figure>
      ) : null}
    </li>
  );
}

function ProofGallery({ photos, proofNotes }) {
  const [expanded, setExpanded] = useState(false);
  const galleryId = useId();
  const visiblePhotos = expanded ? photos : photos.slice(0, 4);

  return (
    <>
      <div className="scout-report-details__section-copy">
        <p>{photos.length ? `${photos.length} saved observation photo${photos.length === 1 ? "" : "s"}. Photos support this report; they do not guarantee current stock.` : "No observation photos were attached. Photos are optional."}</p>
      </div>
      {proofNotes.length ? <div className="scout-report-details__proof-notes"><strong>Saved proof notes</strong>{proofNotes.map((text, index) => <p key={index} className="scout-report-details__saved-note">{text}</p>)}</div> : null}
      {photos.length ? (
        <div id={galleryId} className="scout-report-proof-strip scout-report-details__proof" aria-label="Report proof photos">
          {visiblePhotos.map((src, index) => (
            <figure key={`${src}-${index}`}>
              <ReportImage key={src} src={src} alt={`Report proof ${index + 1}`} />
              <figcaption>Observation photo {index + 1}</figcaption>
            </figure>
          ))}
        </div>
      ) : null}
      {photos.length > 4 ? (
        <div className="scout-report-details__gallery-actions">
          <button type="button" className="secondary-button" aria-expanded={expanded} aria-controls={galleryId} onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Show fewer photos" : `Show ${photos.length - 4} more photo${photos.length - 4 === 1 ? "" : "s"}`}
          </button>
        </div>
      ) : null}
    </>
  );
}

/** Read-only report content. The owning dialog controls navigation and focus. */
export default function RestockReportDetails({
  report = {},
  store = {},
  items = [],
  photos = [],
  stockLabel = "Stock not specified",
  stockGroup = "unknown",
  observedLabel = "Observation time not added",
  trustLabel = "Not verified",
  sourceLabel = "Source not added",
  visibilityLabel = "Sharing preference not added",
  money = (value) => `$${Number(value).toFixed(2)}`,
}) {
  const note = savedText(report.note || report.notes || report.reportText || report.report_text);
  const confidence = savedText(report.confidence);
  const proofNotes = [...new Set([report.proofText, report.proof_text].map(savedText).filter(Boolean))];
  const storeName = savedText(store.name || store.nickname || report.storeName || report.store_name) || "Store not selected";
  const location = [store.address, store.city || report.city, store.state || store.region || report.region].map(savedText).filter(Boolean).join(", ");
  const reporter = savedText(report.submittedByDisplay || report.submitted_by_display || report.displayName || report.reportedBy || report.reported_by);
  const statusClass = ["stock", "low", "empty", "unknown"].includes(stockGroup) ? stockGroup : "unknown";
  const meaningfulItems = preserveLegacyReportZeros(report, items).filter((item) => item && (
    savedText(item.productName) || savedText(item.quantity) || savedText(item.price) || savedText(item.note || item.notes) || item.catalogProductSnapshot || item.catalog_product_snapshot
  ));
  const savedCategory = [report.productCategory, report.product_category, report.productType, report.product_type].map(savedText).find(Boolean) || "";
  const savedReferenceImage = savedText(report.productImageUrl || report.product_image_url);
  const savedReferenceId = savedText(report.catalogProductId || report.catalog_product_id);
  const referenceAlreadyShown = meaningfulItems.some((item) => {
    const snapshot = item.catalogProductSnapshot || item.catalog_product_snapshot || {};
    const image = savedCatalogImage(snapshot);
    return image && (image === savedReferenceImage || (savedReferenceId && savedReferenceId === savedText(item.productId || item.product_id || snapshot.id)));
  });
  const savedReferenceName = savedText(report.catalogProductName || report.catalog_product_name || report.productName || report.product_name || report.itemName || report.item_name) || "Selected product";
  const photoUrls = photos.filter((photo) => typeof photo === "string" && photo.trim());

  return (
    <div className="scout-report-details">
      <div className="scout-report-details__overview" aria-label="Report summary">
        <span className={`scout-report-details__stock scout-report-details__stock--${statusClass}`}>{stockLabel}</span>
        <dl>
          <div><dt>Observed</dt><dd>{observedLabel.replace(/^Observed\s+/i, "")}</dd></div>
          <div><dt>Trust</dt><dd>{trustLabel}</dd></div>
        </dl>
      </div>
      <div className="scout-report-detail-breakdown">
        <details className="scout-report-detail-section" open>
          <summary><span>Details</span><small>{meaningfulItems.length ? `${meaningfulItems.length} reported item${meaningfulItems.length === 1 ? "" : "s"}` : savedCategory ? `${savedCategory} · Category reported` : "General shelf observation"}{note ? " · Report notes" : ""}</small></summary>
          {meaningfulItems.length ? (
            <ul className="scout-report-detail-items scout-report-details__items">
              {meaningfulItems.map((item, index) => <ItemDetails key={`${item.id || item.productId || item.productName || "item"}-${index}`} item={item} index={index} money={money} />)}
            </ul>
          ) : savedCategory ? (
            <div className="scout-report-details__section-copy"><p><strong>{savedCategory}</strong></p><p>Category reported. Individual products were not specified.{photoUrls.length ? " View the attached observation photos below." : ""}</p></div>
          ) : (
            <div className="scout-report-details__section-copy"><p>{photoUrls.length ? "Items have not been identified in this report. View the attached observation photos below." : "No individual product details were added."}</p></div>
          )}
          {savedReferenceImage && !referenceAlreadyShown ? (
            <div className="scout-report-details__report-note">
              <h3>{savedReferenceName}</h3>
              <figure className="scout-report-details__reference">
                <ReportImage key={savedReferenceImage} src={savedReferenceImage} alt={`Catalog reference for ${savedReferenceName}`} reference />
                <figcaption>Catalog reference<br />Not observation proof</figcaption>
              </figure>
            </div>
          ) : null}
          {note ? <div className="scout-report-details__report-note"><h3>Report notes</h3><p className="scout-report-details__saved-note">{note}</p></div> : null}
        </details>
        <details className="scout-report-detail-section">
          <summary><span>Proof / Photos</span><small>{photoUrls.length ? `${photoUrls.length} photo${photoUrls.length === 1 ? "" : "s"} attached` : "No photos attached"}</small></summary>
          <ProofGallery key={report.id || report.reportId || photoUrls.join("|")} photos={photoUrls} proofNotes={proofNotes} />
        </details>
        <details className="scout-report-detail-section">
          <summary><span>Confidence</span><small>{confidence || "Not rated"}</small></summary>
          <div className="scout-report-details__section-copy"><p>{confidence ? `Reported confidence: ${confidence}.` : "No confidence rating was saved for this report."} An observation is a point in time and does not guarantee live stock.</p></div>
        </details>
        <details className="scout-report-detail-section">
          <summary><span>Context / Source</span><small>Store, source, and sharing preference</small></summary>
          <dl className="scout-report-details__context">
            <div><dt>Store</dt><dd>{storeName}{location ? <span>{location}</span> : null}</dd></div>
            <div><dt>Source</dt><dd>{sourceLabel}</dd></div>
            <div><dt>Sharing preference</dt><dd>{visibilityLabel}</dd></div>
            {reporter ? <div><dt>Reported by</dt><dd>{reporter}</dd></div> : null}
            {savedText(report.timezone) ? <div><dt>Time zone</dt><dd>{report.timezone}</dd></div> : null}
          </dl>
          <p className="scout-report-details__sharing-note">A saved sharing preference does not confirm publication to a community or public map.</p>
        </details>
      </div>
    </div>
  );
}
