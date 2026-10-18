import { useId } from "react";
import ItemPhoto from "../ItemPhoto.jsx";
import { PageHeader, PrimaryButton, QuietButton, StatusBadge } from "./OperationsUI.jsx";
import "./record-experience.css";

function joinClassNames(...values) {
  return values.filter(Boolean).join(" ");
}

function RecordDirectionIcon({ back = false }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={back ? "M20 12H4m6-6-6 6 6 6" : "m9 6 6 6-6 6"} /></svg>;
}

export function RecordSummary({ items = [] }) {
  const visible = items.filter((item) => item && item.value !== undefined && item.value !== null && item.value !== "").slice(0, 4);
  if (!visible.length) return null;
  return <dl className="ops-record-summary">{visible.map((item) => <div key={item.label}><dt>{item.label}</dt><dd className={item.numeric ? "is-numeric" : ""}>{item.value}</dd>{item.helper ? <small>{item.helper}</small> : null}</div>)}</dl>;
}

export function DetailSection({ title, description = "", children, open = false }) {
  return <details className="ops-detail-section" name="record-detail-sections" open={open}><summary><span><strong>{title}</strong>{description ? <small>{description}</small> : null}</span><RecordDirectionIcon /></summary><div className="ops-detail-section__body">{children}</div></details>;
}

export function DetailList({ items = [] }) {
  const visible = items.filter((item) => item && item.value !== undefined && item.value !== null && item.value !== "");
  if (!visible.length) return <p className="ops-detail-empty">No additional information has been recorded.</p>;
  return <dl className="ops-detail-list">{visible.map((item) => <div key={item.label}><dt>{item.label}</dt><dd className={item.numeric ? "is-numeric" : ""}>{item.value}</dd></div>)}</dl>;
}

export function RecordTimeline({ entries = [] }) {
  if (!entries.length) return <p className="ops-detail-empty">No history has been recorded yet.</p>;
  return <ol className="ops-record-timeline">{entries.map((entry, index) => <li key={entry.id || `${entry.title}-${index}`}><span aria-hidden="true" /><div><strong>{entry.title}</strong><time>{entry.date || "Date not recorded"}</time>{entry.detail ? <p>{entry.detail}</p> : null}</div></li>)}</ol>;
}

export function RecordDetailPage({ eyebrow = "Record detail", title, status = "", statusTone = "neutral", image = "", imageAlt = "", identity = "", summary = [], primaryAction = null, secondaryActions = null, sections = [], timeline = [], related = null, onBack }) {
  return <main className="ops-record-detail" data-testid="record-detail-page">
    <QuietButton className="ops-detail-back" onClick={onBack}><RecordDirectionIcon back />Back</QuietButton>
    <PageHeader eyebrow={eyebrow} title={title} actions={status ? <StatusBadge tone={statusTone}>{status}</StatusBadge> : null} />
    <section className="ops-detail-hero">
      <ItemPhoto src={image} alt={imageAlt || title} fallbackClassName="ops-detail-identity" loading="eager" />
      <div className="ops-detail-content">{identity ? <p className="ops-detail-identity-copy">{identity}</p> : null}<RecordSummary items={summary} /><div className="ops-detail-actions">{primaryAction}{secondaryActions ? <details className="ops-detail-more"><summary>More</summary><div>{secondaryActions}</div></details> : null}</div></div>
    </section>
    <div className="ops-detail-sections">
      {sections.map((section, index) => <DetailSection key={section.key || section.title} {...section} open={section.open ?? index === 0} />)}
      <DetailSection title="Timeline" description="Changes and recorded milestones."><RecordTimeline entries={timeline} /></DetailSection>
      {related ? <DetailSection title="Related records" description="Connected records retained with this item.">{related}</DetailSection> : null}
    </div>
  </main>;
}

export function FormField({ id: providedId, label, required = false, helper = "", error = "", children, className = "" }) {
  const generatedId = useId();
  const id = providedId || generatedId;
  const labelId = `${id}-label`, helperId = `${id}-help`, errorId = `${id}-error`;
  const accessibility = { "aria-labelledby": labelId, "aria-describedby": joinClassNames(helper && helperId, error && errorId) || undefined, "aria-required": required || undefined, "aria-invalid": Boolean(error) };
  return <label className={joinClassNames("ops-form-field", error && "has-error", className)} htmlFor={id}>
    <span id={labelId}>{label}{required ? <em aria-hidden="true"> *</em> : null}</span>
    {typeof children === "function" ? children(id, accessibility) : children}
    {helper ? <small id={helperId}>{helper}</small> : null}
    {error ? <small id={errorId} className="ops-field-error" role="alert">{error}</small> : null}
  </label>;
}

export function TextField({ label, required, helper, error, value, onChange, multiline = false, className = "", ...props }) {
  return <FormField id={props.id} label={label} required={required} helper={helper} error={error} className={className}>{(id, accessibility) => multiline
    ? <textarea id={id} value={value ?? ""} onChange={(event) => onChange?.(event.target.value)} {...accessibility} {...props} aria-describedby={joinClassNames(accessibility["aria-describedby"], props["aria-describedby"]) || undefined} />
    : <input id={id} value={value ?? ""} onChange={(event) => onChange?.(event.target.value)} {...accessibility} {...props} aria-describedby={joinClassNames(accessibility["aria-describedby"], props["aria-describedby"]) || undefined} />}</FormField>;
}

export function SelectField({ label, required, helper, error, value, onChange, options = [], className = "", ...props }) {
  return <FormField id={props.id} label={label} required={required} helper={helper} error={error} className={className}>{(id, accessibility) => <select id={id} value={value ?? ""} onChange={(event) => onChange?.(event.target.value)} {...accessibility} {...props} aria-describedby={joinClassNames(accessibility["aria-describedby"], props["aria-describedby"]) || undefined}>{options.map((option) => { const normalized = typeof option === "string" ? { value: option, label: option } : option; return <option key={normalized.value} value={normalized.value}>{normalized.label}</option>; })}</select>}</FormField>;
}

export function GuidedFormPage({ title, description, steps = [], activeStep = 0, onStepChange, onBack, onCancel, onSubmit, canContinue = true, submitLabel = "Save", draftLabel = "Draft saved on this device", error = "", children }) {
  const isLast = activeStep >= steps.length - 1;
  return <main className="ops-guided-form" data-testid="guided-record-form">
    <QuietButton className="ops-detail-back" onClick={onBack || onCancel}><RecordDirectionIcon back />Back</QuietButton>
    <PageHeader eyebrow="Record form" title={title} description={description} actions={<StatusBadge tone="neutral">{draftLabel}</StatusBadge>} />
    {steps.length > 1 ? <ol className="ops-form-steps" aria-label={`${title} steps`} style={{ "--ops-step-count": steps.length }}>{steps.map((step, index) => <li key={step} className={index === activeStep ? "is-active" : index < activeStep ? "is-complete" : ""}><button type="button" onClick={() => index <= activeStep && onStepChange?.(index)} aria-current={index === activeStep ? "step" : undefined}><span>{index + 1}</span>{step}</button></li>)}</ol> : null}
    <form onSubmit={(event) => { event.preventDefault(); if (isLast) onSubmit?.(); else if (canContinue) onStepChange?.(activeStep + 1); }} noValidate>
      <section className="ops-form-surface">{children}</section>
      {error ? <p className="ops-form-error" role="alert">{error}</p> : null}
      <div className="ops-form-sticky"><QuietButton onClick={onCancel}>Cancel</QuietButton>{activeStep > 0 ? <QuietButton onClick={() => onStepChange?.(activeStep - 1)}>Previous</QuietButton> : null}<PrimaryButton type="submit" disabled={!canContinue}>{isLast ? submitLabel : "Continue"}</PrimaryButton></div>
    </form>
  </main>;
}
