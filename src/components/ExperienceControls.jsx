import { useId } from "react";
import { EXPERIENCE_PERSONA_OPTIONS, TIER_PREVIEW_OPTIONS, normalizePreviewTier } from "../utils/experiencePresentation.js";
import "./experience-controls.css";

const OPTIONAL_TOOLS = [
  { key: "community", label: "Community", detail: "Show community groups and events." },
  { key: "family", label: "Family tools", detail: "Show family and kids tools where your plan supports them." },
  { key: "assistant", label: "Assistant", detail: "Show the optional assistant entry point." },
];

export function AdminPlanPreviewControls({ tier = "free", persona = "collector", onTierChange, onPersonaChange, onViewPlans }) {
  const hintId = useId();
  const selectedTier = normalizePreviewTier(tier) || "free";
  const selectedPersona = EXPERIENCE_PERSONA_OPTIONS.some((option) => option.value === persona) ? persona : "collector";
  return (
    <div className="experience-controls experience-preview-controls" aria-label="Plan preview controls">
      <div className="experience-preview-controls__fields">
        <label className="experience-controls__field">
          <span>Preview plan</span>
          <select aria-label="Preview plan" aria-describedby={hintId} value={selectedTier} onChange={(event) => onTierChange?.(event.target.value)}>
            {TIER_PREVIEW_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="experience-controls__field">
          <span>Preview experience</span>
          <select aria-label="Preview experience" aria-describedby={hintId} value={selectedPersona} onChange={(event) => onPersonaChange?.(event.target.value)}>
            {EXPERIENCE_PERSONA_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        {onViewPlans ? <button type="button" className="experience-controls__secondary" onClick={onViewPlans}>Compare plans</button> : null}
      </div>
      <p id={hintId} className="experience-controls__hint">Preview only. Your account, saved records, and billing stay unchanged.</p>
      {selectedTier === "shop" ? <p className="experience-controls__hint">Shop Basic and Shop Plus currently share the existing Shop features.</p> : null}
    </div>
  );
}

export function ExperiencePreferences({ experience = {}, optionalTools = {}, onPersonaChange, onOptionalToolChange, previewActive = false }) {
  const controlId = useId();
  const persona = typeof experience === "string" ? experience : experience?.persona || "collector";
  return (
    <section className="experience-controls experience-preferences" aria-labelledby={`${controlId}-title`}>
      <div className="experience-preferences__intro">
        <h3 id={`${controlId}-title`}>Make it yours</h3>
        <p>Choose how Code 3 TCG is organized. Your plan and records stay the same.</p>
      </div>
      {previewActive ? <p className="experience-preferences__preview-note" role="status">You’re previewing another experience. Use the preview controls above, or return to Admin to change your own preferences.</p> : null}
      <fieldset className="experience-preferences__fieldset" disabled={previewActive}>
        <legend>Your experience</legend>
        <div className="experience-preferences__personas">
          {EXPERIENCE_PERSONA_OPTIONS.map((option) => (
            <label className={`experience-preferences__persona${persona === option.value ? " is-selected" : ""}`} key={option.value}>
              <input type="radio" name={`${controlId}-persona`} value={option.value} checked={persona === option.value} onChange={() => onPersonaChange?.(option.value)} />
              <span className="experience-preferences__choice-copy"><strong>{option.label}</strong><span>{option.description}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="experience-preferences__fieldset" disabled={previewActive}>
        <legend>Optional tools</legend>
        <p className="experience-controls__hint">Keep these out of the way until you need them.</p>
        <div className="experience-preferences__optional-tools">
          {OPTIONAL_TOOLS.map((tool) => (
            <label className="experience-preferences__optional-tool" key={tool.key}>
              <input type="checkbox" checked={optionalTools?.[tool.key] === true} onChange={(event) => onOptionalToolChange?.(tool.key, event.target.checked)} />
              <span className="experience-preferences__choice-copy"><strong>{tool.label}</strong><span>{tool.detail}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
