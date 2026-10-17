import { PrimaryButton, SectionHeader, SecondaryButton } from "../../../components/operations/OperationsUI.jsx";
import { AppNavIcon } from "../../../components/command-system/AppNavIcon.jsx";
import ManualLifecycles from "../../manualLifecycles/ManualLifecycles.jsx";
import "./restocks-screen.css";

export default function RestocksScreen({ onOpenRestocks, onReportRestock }) {
  return (
    <section className="flip-section restock-start">
      <SectionHeader title="Restocks" description="Find what collectors are seeing. Share what you find." />
      <div className="restock-start__report">
        <span className="restock-start__icon" aria-hidden="true"><AppNavIcon kind="map" /></span>
        <div className="restock-start__copy">
          <span className="restock-start__eyebrow">Help the next collector</span>
          <h3>Checked a store? Let others know.</h3>
          <p>Share the store, what you saw, and when. Stock, low stock, and empty shelves all help.</p>
        </div>
        <div className="restock-start__actions">
          <PrimaryButton onClick={onReportRestock} disabled={!onReportRestock}>Report a restock</PrimaryButton>
          <SecondaryButton onClick={onOpenRestocks}>Browse reports</SecondaryButton>
        </div>
      </div>
      <ol className="restock-start__steps" aria-label="How to report a restock">
        <li><span aria-hidden="true">1</span><strong>Choose the store</strong></li>
        <li><span aria-hidden="true">2</span><strong>Share what you saw</strong></li>
        <li><span aria-hidden="true">3</span><strong>Review and post</strong></li>
      </ol>
      <p className="restock-start__note">Photos are optional. Reports describe a visit; availability can change before you arrive.</p>
      <details className="restock-start__visits">
        <summary><span>My store visits<small>Keep visit notes and link purchases.</small></span></summary>
        <ManualLifecycles types={["visit"]} title="Visits & purchase attribution" />
      </details>
    </section>
  );
}
