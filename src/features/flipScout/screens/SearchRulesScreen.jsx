import { useRef, useState } from "react";
import { CONFIDENCE_LEVELS, PRODUCT_CLASSIFICATIONS, SEARCH_RULE_TEMPLATES } from "../constants.js";
import { CheckField, EmptyState, FormActions, MoneyInput, NumberInput, SectionHeading, SelectInput, StatusPill, TextArea, TextInput } from "../components/Fields.jsx";

function blankRule() {
  return {
    ruleName: "",
    enabled: false,
    marketplace: "Any approved source",
    includeKeywords: "",
    excludeKeywords: "",
    commonMisspellings: "",
    productClassifications: [],
    minimumPrice: "",
    maximumPrice: "",
    maximumDistance: "",
    localPickupOnly: false,
    buyItNow: true,
    auction: true,
    newlyListedWindow: "24 hours",
    minimumProjectedProfit: "",
    minimumRoi: "",
    minimumConfidence: "Medium",
    maximumPurchaseAmount: "",
    priority: "Normal",
    notes: "",
  };
}

export default function SearchRulesScreen({ rules, onSave, onDelete, onOpenEbay }) {
  const [form, setForm] = useState(blankRule);
  const [formOpen, setFormOpen] = useState(false);
  const [message, setMessage] = useState("");
  const saveInFlightRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));
  const toggleClassification = (classification) => setForm((current) => ({
    ...current,
    productClassifications: current.productClassifications.includes(classification)
      ? current.productClassifications.filter((value) => value !== classification)
      : [...current.productClassifications, classification],
  }));
  const useTemplate = (template) => {
    if (saveInFlightRef.current) return;
    setForm({ ...blankRule(), ...template, id: undefined, templateId: template.id, enabled: false });
    setFormOpen(true);
    setMessage("Template copied as a disabled draft. Review it before enabling.");
  };
  const save = async (event) => {
    event.preventDefault();
    if (!form.ruleName.trim()) return setMessage("Add a rule name before saving.");
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setSaving(true);
    try {
      const saved = await onSave("searchRules", form, { title: form.id ? "Search rule updated" : "Search rule added", detail: `${form.ruleName} · ${form.enabled ? "enabled" : "disabled"}` });
      if (!saved) {
        setMessage("The search rule was not saved. Your entries remain available to review and try again.");
        return;
      }
      setForm(blankRule());
      setFormOpen(false);
      setMessage("Search rule saved. eBay-compatible rules run only when you start a manual eBay search.");
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="flip-screen">
      <section className="flip-section">
        <SectionHeading eyebrow="Connector filters" title="Search Rules" detail="Rules remain device-local and never run in the background. eBay-compatible rules can be loaded into a deliberate manual search." actions={<button type="button" className="primary-button" disabled={saving} onClick={() => { if (saveInFlightRef.current) return; setForm(blankRule()); setFormOpen((open) => !open); }}>{formOpen ? "Close form" : "Create rule"}</button>} />
        {formOpen ? <form className="flip-form" onSubmit={save}>
          <div className="flip-form-grid">
            <TextInput label="Rule name" value={form.ruleName} onChange={set("ruleName")} required />
            <CheckField label="Enabled" helper="Marks the rule ready to use; it does not start background searching." checked={form.enabled} onChange={set("enabled")} />
            <TextInput label="Marketplace / source" value={form.marketplace} onChange={set("marketplace")} />
            <TextArea label="Include keywords" helper="Comma-separated keywords or phrases." value={form.includeKeywords} onChange={set("includeKeywords")} />
            <TextArea label="Exclude keywords" value={form.excludeKeywords} onChange={set("excludeKeywords")} />
            <TextArea label="Common misspellings" value={form.commonMisspellings} onChange={set("commonMisspellings")} />
            <MoneyInput label="Minimum price" value={form.minimumPrice} onChange={set("minimumPrice")} />
            <MoneyInput label="Maximum price" value={form.maximumPrice} onChange={set("maximumPrice")} />
            <NumberInput label="Maximum distance (miles)" value={form.maximumDistance} onChange={set("maximumDistance")} />
            <CheckField label="Local pickup only" checked={form.localPickupOnly} onChange={set("localPickupOnly")} />
            <CheckField label="Buy It Now" checked={form.buyItNow} onChange={set("buyItNow")} />
            <CheckField label="Auction" checked={form.auction} onChange={set("auction")} />
            <TextInput label="Newly listed window" placeholder="24 hours" value={form.newlyListedWindow} onChange={set("newlyListedWindow")} />
            <MoneyInput label="Minimum projected profit" value={form.minimumProjectedProfit} onChange={set("minimumProjectedProfit")} />
            <TextInput label="Minimum ROI" helper="Enter 30 for 30%." type="number" inputMode="decimal" min="0" step="0.1" value={form.minimumRoi} onChange={set("minimumRoi")} />
            <SelectInput label="Minimum confidence" value={form.minimumConfidence} onChange={set("minimumConfidence")} options={CONFIDENCE_LEVELS} />
            <MoneyInput label="Maximum purchase amount" value={form.maximumPurchaseAmount} onChange={set("maximumPurchaseAmount")} />
            <SelectInput label="Priority" value={form.priority} onChange={set("priority")} options={["Low", "Normal", "High", "Urgent"]} />
            <TextArea label="Notes" value={form.notes} onChange={set("notes")} />
          </div>
          <fieldset><legend>Product classifications</legend><div className="flip-check-grid">{PRODUCT_CLASSIFICATIONS.map((classification) => <CheckField key={classification} label={classification} checked={form.productClassifications.includes(classification)} onChange={() => toggleClassification(classification)} />)}</div></fieldset>
          {message ? <p className="flip-form-message" role="status">{message}</p> : null}
          <FormActions><button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : form.id ? "Update rule" : "Save rule"}</button></FormActions>
        </form> : message ? <p className="flip-form-message" role="status">{message}</p> : null}
      </section>

      <section className="flip-section">
        <SectionHeading eyebrow="Saved" title="Your rules" detail="A saved rule does not imply that its marketplace is connected." />
        {rules.length ? <div className="flip-record-list">{rules.map((rule) => <article className="flip-record-card" key={rule.id}>
          <div className="flip-record-card__head"><div><span>{rule.marketplace}</span><h3>{rule.ruleName}</h3></div><StatusPill tone={rule.enabled ? "good" : "muted"}>{rule.enabled ? "Enabled · manual run" : "Disabled"}</StatusPill></div>
          <p>{rule.includeKeywords || "No include keywords set."}</p>
          <div className="flip-record-facts"><span>Priority <strong>{rule.priority}</strong></span><span>Min profit <strong>{rule.minimumProjectedProfit ? `$${rule.minimumProjectedProfit}` : "—"}</strong></span><span>Min ROI <strong>{rule.minimumRoi ? `${rule.minimumRoi}%` : "—"}</strong></span></div>
          <div className="flip-record-actions">{/ebay|any approved source/i.test(rule.marketplace || "") ? <button type="button" className="primary-button" disabled={saving} onClick={() => onOpenEbay(rule.id)}>Open in eBay Search</button> : null}<button type="button" className="secondary-button" disabled={saving} onClick={() => { if (saveInFlightRef.current) return; setForm({ ...blankRule(), ...rule }); setFormOpen(true); window.scrollTo?.({ top: 0, behavior: "smooth" }); }}>Edit</button><button type="button" className="ghost-button flip-delete-button" disabled={saving} onClick={() => { if (!saveInFlightRef.current) return onDelete("searchRules", rule.id, rule.ruleName); return false; }}>Delete</button></div>
        </article>)}</div> : <EmptyState title="No saved search rules">Use an optional template below or create a rule from scratch. Nothing searches in the background.</EmptyState>}
      </section>

      <section className="flip-section">
        <SectionHeading eyebrow="Optional templates" title="Pokémon sourcing ideas" detail="Templates are examples only. They are inactive and contain no marketplace results." />
        <div className="flip-template-grid">{SEARCH_RULE_TEMPLATES.map((template) => <article key={template.id}><span>Inactive template</span><h3>{template.ruleName}</h3><p>{template.notes}</p><button type="button" className="secondary-button" disabled={saving} onClick={() => useTemplate(template)}>Use template</button></article>)}</div>
      </section>
    </div>
  );
}
