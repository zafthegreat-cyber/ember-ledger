export function FormField({ label, helper = "", required = false, children, className = "" }) {
  return (
    <label className={`flip-field ${className}`.trim()}>
      <span>{label}{required ? <b aria-hidden="true"> *</b> : null}</span>
      {children}
      {helper ? <small>{helper}</small> : null}
    </label>
  );
}

export function TextInput({ label, helper, value, onChange, required = false, ...props }) {
  return (
    <FormField label={label} helper={helper} required={required}>
      <input value={value ?? ""} onChange={(event) => onChange(event.target.value)} required={required} {...props} />
    </FormField>
  );
}

export function MoneyInput({ label, helper, value, onChange, ...props }) {
  return (
    <FormField label={label} helper={helper}>
      <div className="flip-money-input"><span>$</span><input type="number" inputMode="decimal" min="0" step="0.01" value={value ?? ""} onChange={(event) => onChange(event.target.value)} {...props} /></div>
    </FormField>
  );
}

export function NumberInput({ label, helper, value, onChange, min = "0", step = "any", ...props }) {
  return (
    <FormField label={label} helper={helper}>
      <input type="number" inputMode="decimal" min={min} step={step} value={value ?? ""} onChange={(event) => onChange(event.target.value)} {...props} />
    </FormField>
  );
}

export function SelectInput({ label, helper, value, onChange, options = [], ...props }) {
  return (
    <FormField label={label} helper={helper}>
      <select value={value ?? ""} onChange={(event) => onChange(event.target.value)} {...props}>
        {options.map((option) => {
          const item = typeof option === "string" ? { value: option, label: option } : option;
          return <option key={item.value} value={item.value}>{item.label}</option>;
        })}
      </select>
    </FormField>
  );
}

export function TextArea({ label, helper, value, onChange, rows = 3, ...props }) {
  return (
    <FormField label={label} helper={helper} className="flip-field--wide">
      <textarea rows={rows} value={value ?? ""} onChange={(event) => onChange(event.target.value)} {...props} />
    </FormField>
  );
}

export function CheckField({ label, helper = "", checked, onChange }) {
  return (
    <label className="flip-check-field">
      <input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} />
      <span><strong>{label}</strong>{helper ? <small>{helper}</small> : null}</span>
    </label>
  );
}

export function FormActions({ children }) {
  return <div className="flip-form-actions">{children}</div>;
}

export function EmptyState({ title, children, action = null }) {
  return (
    <div className="flip-empty-state">
      <span aria-hidden="true">◇</span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}

export function StatusPill({ children, tone = "neutral" }) {
  return <span className={`flip-status flip-status--${tone}`}>{children}</span>;
}

export function SectionHeading({ eyebrow, title, detail, actions = null }) {
  return (
    <div className="flip-section-heading">
      <div>{eyebrow ? <span>{eyebrow}</span> : null}<h2>{title}</h2>{detail ? <p>{detail}</p> : null}</div>
      {actions ? <div className="flip-section-actions">{actions}</div> : null}
    </div>
  );
}

export function RecordActions({ onEdit, onDelete }) {
  return (
    <div className="flip-record-actions">
      {onEdit ? <button type="button" className="secondary-button" onClick={onEdit}>Edit</button> : null}
      {onDelete ? <button type="button" className="ghost-button flip-delete-button" onClick={onDelete}>Delete</button> : null}
    </div>
  );
}
