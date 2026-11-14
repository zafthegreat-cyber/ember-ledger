// Two-tap restock report launcher for Home (SHOULD 18).
// Tap 1: a store you follow (or the one you reported last). Tap 2: what you
// saw. The full report opens on its review step, already filled, so posting is
// the third tap and every required field is still visible before it goes out.
import { useMemo, useState } from "react";
import { buildQuickReportOptions, QUICK_REPORT_STATUSES, quickReportStoreChoices, readQuickReportMemory, rememberQuickReportChoice } from "./quickReport.js";
import "./quick-restock-launcher.css";

export default function QuickRestockLauncher({ followedStores = [], nearbyStores = [], onLaunch = () => {}, kidSafe = false }) {
  const memory = useMemo(() => readQuickReportMemory(), []);
  const choices = useMemo(() => quickReportStoreChoices({ followed: followedStores, nearby: nearbyStores, memory }), [followedStores, nearbyStores, memory]);
  const [storeKey, setStoreKey] = useState(() => choices[0] ? (choices[0].id || choices[0].name) : "");
  if (kidSafe || !choices.length) return null;
  const chosen = choices.find((choice) => (choice.id || choice.name) === storeKey) || choices[0];

  function launch(status) {
    rememberQuickReportChoice({ storeId: chosen.id, storeName: chosen.name, status });
    onLaunch(buildQuickReportOptions({ store: chosen.store, status, memory }));
  }

  return (
    <div className="quick-restock" aria-label="Quick restock report">
      <div className="quick-restock__row" role="radiogroup" aria-label="Store">
        {choices.map((choice) => {
          const key = choice.id || choice.name;
          return (
            <button type="button" key={key} role="radio" aria-checked={key === (chosen.id || chosen.name)} className={`quick-restock__store${key === (chosen.id || chosen.name) ? " is-selected" : ""}`} onClick={() => setStoreKey(key)}>
              <strong>{choice.name}</strong>
              <small>{choice.retailer ? `${choice.retailer} · ${choice.reason}` : choice.reason}</small>
            </button>
          );
        })}
      </div>
      <div className="quick-restock__row quick-restock__statuses" aria-label={`What did you see at ${chosen.name}?`}>
        {QUICK_REPORT_STATUSES.map((status) => (
          <button type="button" key={status.value} className={`quick-restock__status is-${status.tone}`} onClick={() => launch(status.value)}>
            {status.label}
          </button>
        ))}
      </div>
      <small className="quick-restock__hint">Opens the report filled in with “now” and your usual category. You review it before it posts.</small>
    </div>
  );
}
