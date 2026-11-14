// Home "What's new" card (COULD 31). One release at a time; dismiss remembers it.
import { useState } from "react";
import { latestReleaseNote, markWhatsNewSeen, readWhatsNewSeen, shouldShowWhatsNewCard } from "./releaseNotes.js";

export default function WhatsNewCard({ isNewAccount = false, onOpenAll = () => {}, onTour = () => {}, onFeedback = () => {}, onHome = () => {} }) {
  const [seen, setSeen] = useState(() => readWhatsNewSeen());
  const note = latestReleaseNote();
  if (!note || !shouldShowWhatsNewCard({ seenId: seen, isNewAccount })) return null;
  const dismiss = () => { markWhatsNewSeen(note.id); setSeen(note.id); };
  const cta = () => {
    dismiss();
    if (note.ctaDestination === "tour") return onTour();
    if (note.ctaDestination === "feedback") return onFeedback();
    if (note.ctaDestination === "home") return onHome();
    return onOpenAll();
  };
  return (
    <section className="ops-home-section whats-new-card" aria-labelledby="whats-new-title">
      <div className="whats-new-card__head">
        <div>
          <span className="home-group-label">What's new · {note.date}</span>
          <h2 id="whats-new-title">{note.title}</h2>
          <p>{note.body}</p>
        </div>
        <button type="button" className="persona-checklist__dismiss" onClick={dismiss} aria-label="Dismiss what's new">Got it</button>
      </div>
      {note.highlights?.length ? <ul className="whats-new-card__list">{note.highlights.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul> : null}
      <div className="whats-new-card__actions">
        {note.ctaLabel ? <button type="button" className="secondary-button" onClick={cta}>{note.ctaLabel}</button> : null}
        <button type="button" className="secondary-button" onClick={() => { dismiss(); onOpenAll(); }}>All updates</button>
        {note.ctaDestination !== "tour" ? <button type="button" className="secondary-button" onClick={() => { dismiss(); onTour(); }}>Take the tour again</button> : null}
      </div>
    </section>
  );
}
