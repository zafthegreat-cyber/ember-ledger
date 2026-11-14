// Home checklist card (SHOULD 15). Renders buildPersonaChecklist(); hides itself
// once every step is done or the person dismisses it. 44px targets; the whole
// row is the button so it works one-handed.
import { useMemo, useState } from "react";
import { buildPersonaChecklist, dismissChecklist, shouldShowChecklist } from "./personaChecklist.js";
import "./persona-checklist.css";

export default function PersonaChecklist({ persona = "collector", kidSafe = false, counts = {}, onOpen = () => {} }) {
  const checklist = useMemo(() => buildPersonaChecklist({ persona, kidSafe, counts }), [persona, kidSafe, counts]);
  const [dismissed, setDismissed] = useState(() => !shouldShowChecklist(checklist));
  if (dismissed || !shouldShowChecklist(checklist)) return null;
  return (
    <section className="ops-home-section persona-checklist" aria-labelledby="persona-checklist-title">
      <header className="persona-checklist__head">
        <div>
          <span className="home-group-label">Getting started · {checklist.done} of {checklist.total}</span>
          <h2 id="persona-checklist-title">{checklist.title}</h2>
          <p>{checklist.intro}</p>
        </div>
        <button type="button" className="persona-checklist__dismiss" onClick={() => { dismissChecklist(checklist.key); setDismissed(true); }} aria-label="Hide this checklist">Hide</button>
      </header>
      <ol className="persona-checklist__steps">
        {checklist.steps.map((step, index) => (
          <li key={step.key} className={step.done ? "is-done" : ""}>
            <button type="button" onClick={() => !step.done && onOpen(step.target, step)} disabled={step.done} aria-label={`${step.label}${step.done ? " (done)" : ""}`}>
              <span className="persona-checklist__mark" aria-hidden="true">{step.done ? "✓" : index + 1}</span>
              <span className="persona-checklist__copy"><strong>{step.label}</strong><small>{step.detail}</small></span>
              {!step.done ? <span className="persona-checklist__chevron" aria-hidden="true">›</span> : null}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
