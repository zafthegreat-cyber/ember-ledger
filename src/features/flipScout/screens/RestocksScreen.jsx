import { PrimaryButton, SectionHeader, SecondaryButton } from "../../../components/operations/OperationsUI.jsx";
import { AppNavIcon } from "../../../components/command-system/AppNavIcon.jsx";
import ManualLifecycles from "../../manualLifecycles/ManualLifecycles.jsx";
import RestockMapCard from "../../restocks/RestockMapCard.jsx";
import "./restocks-screen.css";

export default function RestocksScreen({ onOpenRestocks, onReportRestock, restockMap = null }) {
  return (
    <section className="flip-section restock-start">
      <SectionHeader title="Restocks" description="Find what collectors are seeing. Share what you find." />
      {restockMap?.stores?.length ? <RestockMapCard stores={restockMap.stores} reports={restockMap.reports} isFollowed={restockMap.isFollowed} onOpenStore={restockMap.onOpenStore} onReportAtStore={restockMap.onReportAtStore} onFollowStore={restockMap.onFollowStore} onBrowseAll={onOpenRestocks} /> : null}
      <div className="restock-start__report">
        <span className="restock-start__icon" aria-hidden="true"><AppNavIcon kind="map" /></span>
        <div className="restock-start__copy">
          <h3>Stocked or empty?</h3>
          <p>Share what you saw and when.</p>
        </div>
        <div className="restock-start__actions">
          <PrimaryButton onClick={onReportRestock} disabled={!onReportRestock}>Report a restock</PrimaryButton>
          <SecondaryButton onClick={onOpenRestocks}>Browse reports</SecondaryButton>
        </div>
      </div>
      <details className="restock-start__how precise-section"><summary><span><strong>How reporting works</strong><small>Choose a store, add details, review</small></span></summary>
      <ol className="restock-start__steps" aria-label="How to report a restock">
        <li><span aria-hidden="true">1</span><strong>Choose the store</strong></li>
        <li><span aria-hidden="true">2</span><strong>Share what you saw</strong></li>
        <li><span aria-hidden="true">3</span><strong>Review and post</strong></li>
      </ol>
      </details>
      <p className="restock-start__note">Photos are optional. Reports describe a visit; availability can change before you arrive.</p>
      <details className="restock-start__visits precise-section">
        <summary><span><strong>My store visits</strong><small>Keep visit notes and link purchases.</small></span></summary>
        <ManualLifecycles types={["visit"]} title="Visits & purchase attribution" />
      </details>
    </section>
  );
}
