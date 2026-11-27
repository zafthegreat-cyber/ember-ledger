import { useId, useState } from "react";
import {
  CARD_SCAN_CONDITIONS,
  CARD_SCAN_GRADERS,
  CARD_SCAN_GRADES,
  CARD_SCAN_LANGUAGES,
  CARD_SCAN_SPECIAL_PRINTINGS,
  cardScanCondition,
  cardScanFinishChoices,
  cardScanGradeLabel,
  cardScanGradingPatch,
  cardScanLanguage,
  cardScanLanguageLabel,
  cardScanLanguagePatch,
  cardScanPrinting,
  cardScanPrintingParts,
  cardScanPrintingWith,
  cardScanRowsToChange,
  isCardScanGraded,
} from "../utils/cardScanDetails.mjs";
import "./card-scan-row-details.css";

// One-tap condition, printing and grading on a scanned card (Nov 27 2026, owner: "Make
// changing the condition or marking it as a graded or changing the type (holo, reverse
// holo) if needed very simple"). Each row shows what it will save as three buttons; a tap
// opens the choices right under them, and one more tap sets it.
// Nov 27 2026 (non-English cards): a fourth button for the card's language. A new language
// finds the card again in that language's catalog (the list does that on onChange).
export default function CardScanRowDetails({ row, rows = [], cardTitle = "this card", onChange, onApplyToAll }) {
  const id = useId();
  const [open, setOpen] = useState("");
  const [offer, setOffer] = useState(null);
  const [morePrintings, setMorePrintings] = useState(false);
  const [otherCompany, setOtherCompany] = useState(false);
  // What is in "Other grade" while it is being typed: "9" on the way to "9.5" stays in the box,
  // and a grade picked from the buttons does not show up in it.
  const [gradeDraft, setGradeDraft] = useState(null);
  if (!row) return null;
  const graded = isCardScanGraded(row);
  const condition = cardScanCondition(row);
  const printing = cardScanPrinting(row);
  const parts = cardScanPrintingParts(row.variant);
  const finishes = cardScanFinishChoices(row.matchedProduct);
  const toggle = (name) => { setOffer(null); setOpen((current) => (current === name ? "" : name)); };
  // After a change, offer the same for the other cards in the list (only when some differ).
  const offerAll = (field, value, label) => {
    const others = cardScanRowsToChange(rows, row.id, field, value);
    setOffer(onApplyToAll && others > 0 ? { field, value, label, others } : null);
  };
  const pickCondition = (value) => {
    onChange?.({ condition: value });
    setOpen("");
    offerAll("condition", value, value);
  };
  const pickPrinting = (patch) => {
    const value = cardScanPrintingWith(row.variant, patch);
    onChange?.({ variant: value });
    setOpen("");
    offerAll("variant", value, cardScanPrinting({ variant: value }) || "Normal");
  };
  const language = cardScanLanguage(row);
  const pickLanguage = (value) => {
    onChange?.(cardScanLanguagePatch(value));
    setOpen("");
    offerAll("language", value, value);
  };
  const pickCompany = (company) => {
    setOtherCompany(false);
    onChange?.(cardScanGradingPatch(row, company));
  };
  const companyIsListed = CARD_SCAN_GRADERS.includes(String(row.gradingCompany || "").trim());
  const gradeIsListed = CARD_SCAN_GRADES.includes(String(row.grade || "").trim());
  const chip = (label, selected, onClick, extra = {}) => (
    <button key={label} type="button" role="radio" aria-checked={selected} className="card-scan-details__chip" onClick={onClick} {...extra}>{label}</button>
  );
  return (
    <div className="card-scan-details">
      <div className="card-scan-details__bar" role="group" aria-label={`Condition, printing, grading and language for ${cardTitle}`}>
        {!graded ? (
          <button type="button" className="card-scan-details__pill" aria-expanded={open === "condition"} aria-controls={`${id}-condition`} aria-label={`Condition: ${condition}. Change`} onClick={() => toggle("condition")}>
            {condition}<span aria-hidden="true" className="card-scan-details__caret">▾</span>
          </button>
        ) : null}
        <button type="button" className={`card-scan-details__pill${printing ? "" : " is-unset"}`} aria-expanded={open === "printing"} aria-controls={`${id}-printing`} aria-label={`Printing: ${printing || "not chosen"}. Change`} onClick={() => toggle("printing")}>
          {printing || "Printing"}<span aria-hidden="true" className="card-scan-details__caret">▾</span>
        </button>
        <button type="button" className={`card-scan-details__pill${graded ? " is-graded" : ""}`} aria-expanded={open === "grading"} aria-controls={`${id}-grading`} aria-label={`Grading: ${cardScanGradeLabel(row)}. Change`} onClick={() => toggle("grading")}>
          {cardScanGradeLabel(row)}<span aria-hidden="true" className="card-scan-details__caret">▾</span>
        </button>
        <button type="button" className={`card-scan-details__pill${row.languageCheck ? " is-check" : ""}`} aria-expanded={open === "language"} aria-controls={`${id}-language`} aria-label={`Language: ${row.languageCheck ? `${language}, please check` : language}. Change`} onClick={() => toggle("language")}>
          {cardScanLanguageLabel(row)}<span aria-hidden="true" className="card-scan-details__caret">▾</span>
        </button>
      </div>

      {open === "condition" ? (
        <div className="card-scan-details__picker" id={`${id}-condition`}>
          <div className="card-scan-details__chips" role="radiogroup" aria-label={`Condition of ${cardTitle}`}>
            {CARD_SCAN_CONDITIONS.map((value) => chip(value, condition === value, () => pickCondition(value)))}
          </div>
        </div>
      ) : null}

      {open === "printing" ? (
        <div className="card-scan-details__picker" id={`${id}-printing`}>
          <div className="card-scan-details__chips" role="radiogroup" aria-label={`Printing of ${cardTitle}`}>
            {finishes.map((value) => chip(value, parts.finish === value, () => pickPrinting({ finish: value })))}
          </div>
          {morePrintings || parts.special ? (
            <>
              <p className="card-scan-details__label">Special printing or stamp</p>
              <div className="card-scan-details__chips" role="radiogroup" aria-label={`Special printing of ${cardTitle}`}>
                {chip("None", !parts.special, () => pickPrinting({ special: "" }))}
                {CARD_SCAN_SPECIAL_PRINTINGS.map((item) => chip(item.label, parts.special === item.key, () => pickPrinting({ special: item.key }), { title: item.hint }))}
              </div>
              <label className="card-scan-details__field">Something else
                <input value={row.variant || ""} onChange={(event) => onChange?.({ variant: event.target.value })} placeholder="Galaxy holo, Japanese promo..." />
              </label>
            </>
          ) : (
            <button type="button" className="ghost-button card-scan-details__more" onClick={() => setMorePrintings(true)}>More printings and stamps</button>
          )}
        </div>
      ) : null}

      {open === "grading" ? (
        <div className="card-scan-details__picker" id={`${id}-grading`}>
          <p className="card-scan-details__label">Graded by</p>
          <div className="card-scan-details__chips" role="radiogroup" aria-label={`Grading company for ${cardTitle}`}>
            {chip("Not graded", !graded, () => pickCompany(""))}
            {CARD_SCAN_GRADERS.map((company) => chip(company, String(row.gradingCompany || "").trim() === company, () => pickCompany(company)))}
            {chip("Other", graded && (otherCompany || !companyIsListed), () => { setOtherCompany(true); onChange?.({ graded: true, gradingCompany: companyIsListed ? "" : row.gradingCompany || "" }); })}
          </div>
          {graded && (otherCompany || !companyIsListed) ? (
            <label className="card-scan-details__field">Company name
              <input value={row.gradingCompany || ""} onChange={(event) => onChange?.({ graded: true, gradingCompany: event.target.value })} placeholder="Beckett, PSA/DNA..." />
            </label>
          ) : null}
          {graded ? (
            <>
              <p className="card-scan-details__label">Grade</p>
              <div className="card-scan-details__chips" role="radiogroup" aria-label={`Grade of ${cardTitle}`}>
                {CARD_SCAN_GRADES.map((grade) => chip(grade, String(row.grade || "").trim() === grade, () => onChange?.({ graded: true, grade })))}
              </div>
              <div className="card-scan-details__fields">
                <label className="card-scan-details__field">Other grade
                  <input value={gradeDraft ?? (gradeIsListed ? "" : row.grade || "")} onFocus={() => setGradeDraft(gradeIsListed ? "" : row.grade || "")} onBlur={() => setGradeDraft(null)} onChange={(event) => { setGradeDraft(event.target.value); onChange?.({ graded: true, grade: event.target.value }); }} placeholder="e.g. 4" />
                </label>
                <label className="card-scan-details__field">Certificate number (optional)
                  <input value={row.certificationNumber || ""} onChange={(event) => onChange?.({ graded: true, certificationNumber: event.target.value })} autoComplete="off" />
                </label>
              </div>
            </>
          ) : null}
          <button type="button" className="secondary-button card-scan-details__done" onClick={() => setOpen("")}>Done</button>
        </div>
      ) : null}

      {open === "language" ? (
        <div className="card-scan-details__picker" id={`${id}-language`}>
          {row.languageCheck ? <p className="card-scan-details__label">Korean and Chinese cards print the same set codes as Japanese ones. Which is this card?</p> : null}
          <div className="card-scan-details__chips" role="radiogroup" aria-label={`Language of ${cardTitle}`}>
            {CARD_SCAN_LANGUAGES.map((value) => chip(value, language === value && !row.languageCheck, () => pickLanguage(value)))}
          </div>
        </div>
      ) : null}

      {offer ? (
        <button type="button" className="ghost-button card-scan-details__all" onClick={() => { onApplyToAll?.(offer.field, offer.value); setOffer(null); }}>
          Use {offer.label} for {offer.others === 1 ? "the other card" : `the other ${offer.others} cards`}
        </button>
      ) : null}
    </div>
  );
}
