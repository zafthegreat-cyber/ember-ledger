// Two-tap restock report launcher for Home (SHOULD 18; build-11 fixes).
// Tap 1: a store you follow (or the one you reported last; or a suggested
// directory store when you follow nothing yet). Tap 2: what you saw. A small
// Sealed / Singles / Both row sits between them, pre-set to what you chose
// last time at that store. The full report opens on its review step, already
// filled, so posting is the third tap and every required field is still
// visible before it goes out.
import { useMemo, useState } from "react";
import { buildQuickReportOptions, categoryForStore, QUICK_REPORT_CATEGORIES, QUICK_REPORT_STATUSES, quickReportStoreChoices, readQuickReportMemory, rememberQuickReportChoice } from "./quickReport.js";
import "./quick-restock-launcher.css";

export default function QuickRestockLauncher({ followedStores = [], nearbyStores = [], onLaunch = () => {}, kidSafe = false }) {
  const memory = useMemo(() => readQuickReportMemory(), []);
  const choices = useMemo(() => quickReportStoreChoices({ followed: followedStores, nearby: nearbyStores, memory }), [followedStores, nearbyStores, memory]);
  const [storeKey, setStoreKey] = useState(() => choices[0] ? (choices[0].id || choices[0].name) : "");
  const chosen = choices.find((choice) => (choice.id || choice.name) === storeKey) || choices[0];
  const [categoryOverride, setCategoryOverride] = useState("");
  if (kidSafe || !choices.length) return null;
  const category = categoryOverride || categoryForStore(chosen.store, memory);
  const suggestedOnly = !followedStores.length;

  function launch(status) {
    rememberQuickReportChoice({ storeId: chosen.id, storeName: chosen.name, status, category });
    onLaunch(buildQuickReportOptions({ store: chosen.store, status, category, memory }));
  }

  return (
    <div className="quick-restock" aria-label="Quick restock report">
      <div className="quick-restock__row" role="radiogroup" aria-label="Store">
        {choices.map((choice) => {
          const key = choice.id || choice.name;
          return (
            <button type="button" key={key} role="radio" aria-checked={key === (chosen.id || chosen.name)} className={`quick-restock__store${key === (chosen.id || chosen.name) ? " is-selected" : ""}`} onClick={() => { setStoreKey(key); setCategoryOverride(""); }}>
              <strong>{choice.name}</strong>
              <small>{choice.retailer ? `${choice.retailer} · ${choice.reason}` : choice.reason}</small>
            </button>
          );
        })}
      </div>
      <div className="quick-restock__row quick-restock__categories" role="radiogroup" aria-label="What kind of product">
        {QUICK_REPORT_CATEGORIES.map((entry) => (
          <button type="button" key={entry.value} role="radio" aria-checked={category === entry.value} className={`quick-restock__category${category === entry.value ? " is-selected" : ""}`} onClick={() => setCategoryOverride(entry.value)}>
            {entry.label}
          </button>
        ))}
      </div>
      <div className="quick-restock__row quick-restock__statuses" aria-label={`What did you see at ${chosen.name}?`}>
        {QUICK_REPORT_STATUSES.map((status) => (
          <button type="button" key={status.value} className={`quick-restock__status is-${status.tone}`} onClick={() => launch(status.value)}>
            {status.label}
          </button>
        ))}
      </div>
      <small className="quick-restock__hint">{suggestedOnly ? "Follow a store in Restocks and it shows up here first. " : ""}Opens the report filled in with “now”. You review it before it posts.</small>
    </div>
  );
}
