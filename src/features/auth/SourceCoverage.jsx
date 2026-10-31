import "./member-start.css";

// A release-level capability statement, not a live stock or source-health feed.
// Update only after the owner authorizes and verifies a source rollout.
export const BEST_BUY_RELEASE_STATUS = "paused";
export default function SourceCoverage({ compact = false }) {
  return <aside className="member-coverage" aria-label="Restock source coverage">
    <details open={!compact || undefined}><summary>Source coverage · Best Buy paused</summary>
    <p><strong>Community observations:</strong> members share what they saw, with a store or Online choice and observation time. A reviewed report is not a retailer guarantee. Availability can change before you arrive.</p>
    <p><strong>Automatic retailer monitoring:</strong> availability depends on each connected source. Best Buy monitoring is <strong>paused</strong> for this release. While paused, it makes no inventory checks and sends no automatic Best Buy alerts.</p>
    <p>A member’s report about Best Buy remains a community observation. It does not mean Best Buy monitoring has resumed. Review each report’s source and time before making a trip.</p>
    </details>
  </aside>;
}
