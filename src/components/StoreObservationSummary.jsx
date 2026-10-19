import { useId } from "react";
import { restockReportObservedLabel, restockReportStockGroup, restockReportTrustLabel } from "../utils/restockFeedPresentation.mjs";
import { selectStoreObservation, storeObservationProductSummary } from "../utils/storeObservationPresentation.mjs";
import "./store-observation-summary.css";

const EMPTY_REPORTS = [];
const STOCK_LABELS = { stock: "Stock seen", low: "Low stock", empty: "Empty shelves", other: "Stock not specified" };

export default function StoreObservationSummary({ reports = EMPTY_REPORTS, now, onOpenReport, stockLabel }) {
  const id = useId();
  const { report, isDatedPast } = selectStoreObservation(reports, now);
  const stockGroup = report ? restockReportStockGroup(report) : "other";
  const hasPhoto = report ? [
    ...(Array.isArray(report.photoUrls) ? report.photoUrls : []),
    ...(Array.isArray(report.photo_urls) ? report.photo_urls : []),
    report.imageUrl, report.image_url, report.photoUrl, report.photo_url,
  ].some((value) => typeof value === "string" && Boolean(value.trim())) : false;
  const trustLabel = report ? restockReportTrustLabel(report, hasPhoto) : "";

  return (
    <section className="scout-store-observation" aria-labelledby={`${id}-title`}>
      <div className="scout-store-observation__heading">
        <p className="scout-store-observation__eyebrow">Community observations</p>
        <h3 id={`${id}-title`}>{isDatedPast ? "Latest dated observation" : report ? "No dated observation available" : "No stock observations yet"}</h3>
      </div>
      {report ? (
        <>
          <div className="scout-store-observation__signal">
            <span className={`scout-store-observation__stock scout-store-observation__stock--${isDatedPast ? stockGroup : "other"}`}>{stockLabel?.(report) || STOCK_LABELS[stockGroup]}</span>
            <span>{restockReportObservedLabel(report, now)}</span>
          </div>
          <p className="scout-store-observation__products">{storeObservationProductSummary(report)}</p>
          <div className="scout-store-observation__footer">
            <p>{trustLabel}{trustLabel === "Historical import" ? " · Not live verified" : ""}</p>
            {typeof onOpenReport === "function" ? <button type="button" className="secondary-button" onClick={(event) => onOpenReport(report, event.currentTarget)}>{isDatedPast ? "View report" : "View saved report"}<span aria-hidden="true">→</span></button> : null}
          </div>
          <p className="scout-store-observation__note">{isDatedPast ? "Stock may have changed since this visit." : "This report has a future or unavailable observation time. Check the full report before making a trip."}</p>
        </>
      ) : (
        <p className="scout-store-observation__note">Checked this store? Report stock, low stock, or an empty shelf to help the next collector. A photo is optional.</p>
      )}
    </section>
  );
}
