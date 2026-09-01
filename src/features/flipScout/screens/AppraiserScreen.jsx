import { useEffect, useMemo, useRef, useState } from "react";
import { CONFIDENCE_LEVELS, PRODUCT_CLASSIFICATIONS } from "../constants.js";
import { analyzeListing } from "../calculations.js";
import { formatCurrency, formatPercent } from "../selectors.js";
import { CheckField, FormActions, MoneyInput, SectionHeading, SelectInput, StatusPill, TextArea, TextInput } from "../components/Fields.jsx";
import { ConfidenceIndicator, RiskIndicator, StickyDecisionBar } from "../../../components/operations/OperationsUI.jsx";
import { BRAND_CONFIG } from "../../../config/brand.js";
import {
  CARD_CONDITION,
  CARD_FORMAT,
  DEFECT_SEVERITY,
  DEFECT_TYPE,
  IMAGE_SIDE,
  INTELLIGENCE_CONFIDENCE,
  createCardAnalysisPipeline,
} from "../../intelligence/index.js";
import { createLocalAnalysisHistory } from "../../intelligence/analysisHistory.js";
import { buildCardAnalysisInput, formatBasisPoints, formatMinorMoney, minorMoneyToMajorInput, nextOwnerObservationId, optionalMoney, selectVerifiedStoredComparables } from "../intelligenceFormAdapter.js";

const DRAFT_KEY = "private-business-hub.deal-analysis-draft.v1";
const STEPS = ["Listing", "Item Details", "Purchase Costs", "Resale Assumptions", "Decision"];

function blankAppraisal() {
  return {
    marketplace: "Manual entry",
    listingUrl: "",
    title: "",
    description: "",
    productClassification: "Unknown",
    itemCondition: "",
    itemNotes: "",
    cardSet: "",
    cardNumber: "",
    cardLanguage: "English",
    cardVariant: "",
    printingOrEdition: "",
    cardFormat: CARD_FORMAT.RAW,
    gradingCompany: "",
    grade: "",
    certificationNumber: "",
    identityConfidence: INTELLIGENCE_CONFIDENCE.LOW,
    frontImageReference: "",
    backImageReference: "",
    frontImageQuality: INTELLIGENCE_CONFIDENCE.MEDIUM,
    backImageQuality: INTELLIGENCE_CONFIDENCE.MEDIUM,
    frontGlare: false,
    frontSleeve: false,
    frontToploader: false,
    frontBlur: false,
    frontLowResolution: false,
    frontCropped: false,
    backGlare: false,
    backSleeve: false,
    backToploader: false,
    backBlur: false,
    backLowResolution: false,
    backCropped: false,
    inspectionComplete: false,
    defectObservations: [],
    ownerConfirmedCondition: "",
    ownerCorrectionNote: "",
    ownerManualEstimatedValue: "",
    ownerReviewConfirmed: false,
    dismissedWarningCodes: [],
    purchasePrice: "",
    purchaseShipping: "",
    purchaseTax: "",
    buyerPremium: "",
    fixedBuyerFees: "",
    travelOrPickupCost: "",
    preparationCost: "",
    otherAcquisitionCosts: "",
    expectedResaleLow: "",
    expectedResaleMidpoint: "",
    expectedResaleHigh: "",
    expectedSellingPlatform: "eBay",
    sellingFeePercentage: "",
    fixedSellingFees: "",
    outboundShipping: "",
    packagingCost: "",
    returnOrFraudReserve: "",
    otherSellingCosts: "",
    minimumDesiredProfit: "",
    minimumDesiredRoi: "",
    confidence: "Low",
    riskSeverity: "MEDIUM",
    riskNotes: "",
    completedSalesText: "",
    completedSalesVerified: false,
    valuationEvidence: [],
  };
}

function loadDraft() {
  if (typeof window === "undefined") return { form: blankAppraisal(), step: 0, analysisId: null };
  try {
    const saved = JSON.parse(window.sessionStorage?.getItem(DRAFT_KEY) || "null");
    const analysisId = typeof saved?.analysisId === "string" && saved.analysisId.length <= 200
      ? saved.analysisId.trim() || null
      : null;
    return { form: { ...blankAppraisal(), ...(saved?.form || {}) }, step: Math.min(4, Math.max(0, Number(saved?.step || 0))), analysisId };
  } catch {
    return { form: blankAppraisal(), step: 0, analysisId: null };
  }
}

function displayRecommendation(label) {
  if (label === "Strong Buy" || label === "Exceptional Deal") return "Strong Opportunity";
  if (label === "Personal Collection Only") return "Personal Collection";
  if (label === "Insufficient Information") return "Not Enough Information";
  return label;
}

function recommendationTone(label) {
  if (/exceptional|strong/i.test(label)) return "good";
  if (/offer|fair|watch/i.test(label)) return "warning";
  if (/pass/i.test(label)) return "danger";
  return "neutral";
}

function intelligenceRecommendation(label) {
  return {
    STRONG_BUY: "Strong Opportunity",
    BUY: "Buy",
    WATCH: "Worth Watching",
    PASS: "Pass",
    INSUFFICIENT_DATA: "Not Enough Information",
  }[label] || "Not Enough Information";
}

function optionLabel(value) {
  return String(value || "").toLowerCase().replaceAll("_", " ").replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function safeOwnerMoney(value) {
  try {
    return optionalMoney(value, "ownerManualEstimatedValue");
  } catch {
    return null;
  }
}

function moneyToInput(value) {
  return minorMoneyToMajorInput(value);
}

function warningCode(warning) {
  let hash = 2_166_136_261;
  for (const character of String(warning || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return `WARNING_${hash.toString(16).padStart(8, "0").toUpperCase()}`;
}

function formFromStoredAnalysis(record) {
  const source = record?.sourceInput || {};
  const identity = source.identity || {};
  const images = Array.isArray(source.images) ? source.images : [];
  const front = images.find((image) => image.side === IMAGE_SIDE.FRONT);
  const back = images.find((image) => image.side === IMAGE_SIDE.BACK);
  const assumptions = source.dealAssumptions || {};
  const review = record?.ownerReview || {};
  const verifiedSales = selectVerifiedStoredComparables(source.valuationEvidence)
    .map((entry) => `${moneyToInput(entry.amount)} | ${entry.soldAt || ""} | ${entry.sourceId || ""} | ${entry.condition || ""}`);
  const snapshot = record?.workflowSnapshot && typeof record.workflowSnapshot === "object"
    ? record.workflowSnapshot
    : {
      title: identity.productName || "",
      listingUrl: source.sourceReference || "",
      cardSet: identity.set || "",
      cardNumber: identity.cardNumber || "",
      cardLanguage: identity.language || "English",
      cardVariant: identity.variant || "",
      printingOrEdition: identity.printingOrEdition || "",
      cardFormat: identity.format || CARD_FORMAT.RAW,
      gradingCompany: identity.gradingCompany || "",
      grade: identity.grade || "",
      certificationNumber: identity.certificationNumber || "",
      identityConfidence: identity.confidence || INTELLIGENCE_CONFIDENCE.LOW,
      frontImageReference: front?.reference || "",
      frontImageQuality: front?.quality || INTELLIGENCE_CONFIDENCE.MEDIUM,
      frontGlare: Boolean(front?.effects?.glare),
      frontSleeve: Boolean(front?.effects?.sleeve),
      frontToploader: Boolean(front?.effects?.toploader),
      frontBlur: Boolean(front?.effects?.blur),
      frontLowResolution: Boolean(front?.effects?.lowResolution),
      frontCropped: Boolean(front?.effects?.cropped),
      backImageReference: back?.reference || "",
      backImageQuality: back?.quality || INTELLIGENCE_CONFIDENCE.MEDIUM,
      backGlare: Boolean(back?.effects?.glare),
      backSleeve: Boolean(back?.effects?.sleeve),
      backToploader: Boolean(back?.effects?.toploader),
      backBlur: Boolean(back?.effects?.blur),
      backLowResolution: Boolean(back?.effects?.lowResolution),
      backCropped: Boolean(back?.effects?.cropped),
      defectObservations: source.observations || [],
      inspectionComplete: Boolean(source.inspectionComplete),
      completedSalesText: verifiedSales.join("\n"),
      completedSalesVerified: verifiedSales.length > 0,
      purchasePrice: moneyToInput(assumptions.askingPrice),
      purchaseShipping: moneyToInput(assumptions.purchaseShipping),
      purchaseTax: moneyToInput(assumptions.purchaseTax),
      travelOrPickupCost: moneyToInput(assumptions.travelCost),
      otherAcquisitionCosts: moneyToInput(assumptions.acquisitionFees),
      expectedResaleMidpoint: moneyToInput(assumptions.expectedResaleValue),
      sellingFeePercentage: Number.isSafeInteger(assumptions.sellingFeeBasisPoints) ? (assumptions.sellingFeeBasisPoints / 100).toFixed(2) : "",
      fixedSellingFees: moneyToInput(assumptions.fixedSellingFees),
      outboundShipping: moneyToInput(assumptions.outboundShipping),
      packagingCost: moneyToInput(assumptions.packagingCost),
      returnOrFraudReserve: moneyToInput(assumptions.returnReserve),
      minimumDesiredProfit: moneyToInput(assumptions.minimumProfit),
      minimumDesiredRoi: Number.isSafeInteger(assumptions.minimumRoiBasisPoints) ? (assumptions.minimumRoiBasisPoints / 100).toFixed(2) : "",
    };
  return {
    ...blankAppraisal(),
    ...snapshot,
    ownerConfirmedCondition: review.ownerConfirmedCondition || "",
    ownerManualEstimatedValue: moneyToInput(review.manualValues?.estimatedValue),
    dismissedWarningCodes: Array.isArray(review.dismissedWarningCodes) ? review.dismissedWarningCodes : [],
    ownerReviewConfirmed: false,
  };
}

function stableFormValue(value) {
  if (Array.isArray(value)) return value.map(stableFormValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableFormValue(value[key])]));
  }
  return value;
}

function formMatchesStoredAnalysis(form, record) {
  if (!form || !record) return false;
  try {
    return JSON.stringify(stableFormValue(form)) === JSON.stringify(stableFormValue(formFromStoredAnalysis(record)));
  } catch {
    return false;
  }
}

function observationDraft() {
  return {
    defectType: DEFECT_TYPE.WHITENING,
    severity: DEFECT_SEVERITY.MINOR,
    side: IMAGE_SIDE.BACK,
    quantity: 1,
    location: "",
    structuralDamage: false,
    confidence: INTELLIGENCE_CONFIDENCE.MEDIUM,
    note: "",
  };
}

function DefectObservationEditor({ observations, onChange }) {
  const [draft, setDraft] = useState(observationDraft);
  const setDraftValue = (key) => (value) => setDraft((current) => ({ ...current, [key]: value }));
  const add = () => {
    const semanticKey = [draft.defectType, draft.severity, draft.side, draft.quantity, draft.location.trim(), draft.structuralDamage, draft.confidence, draft.note.trim()].join("|");
    const normalizedDraft = { ...draft, location: draft.location.trim(), note: draft.note.trim() };
    const next = {
      ...draft,
      observationId: nextOwnerObservationId(normalizedDraft, observations),
      semanticKey,
      locations: draft.location.trim() ? [draft.location.trim()] : [],
      observed: true,
      provenance: "OWNER_ENTERED",
    };
    delete next.location;
    onChange([...observations, next]);
    setDraft(observationDraft());
  };
  return <div className="code3-observation-editor">
    <div className="flip-form-grid">
      <SelectInput label="Defect" value={draft.defectType} onChange={setDraftValue("defectType")} options={Object.values(DEFECT_TYPE).map((value) => ({ value, label: optionLabel(value) }))} />
      <SelectInput label="Severity" value={draft.severity} onChange={setDraftValue("severity")} options={Object.values(DEFECT_SEVERITY).map((value) => ({ value, label: optionLabel(value) }))} />
      <SelectInput label="Side" value={draft.side} onChange={setDraftValue("side")} options={Object.values(IMAGE_SIDE).map((value) => ({ value, label: optionLabel(value) }))} />
      <TextInput label="Location" value={draft.location} onChange={setDraftValue("location")} placeholder="Top edge, lower-left corner…" />
      <SelectInput label="Observation confidence" value={draft.confidence} onChange={setDraftValue("confidence")} options={Object.values(INTELLIGENCE_CONFIDENCE).map((value) => ({ value, label: optionLabel(value) }))} />
      <TextInput label="Observation note" value={draft.note} onChange={setDraftValue("note")} />
    </div>
    <CheckField label="Structural damage" helper="Use for a crease, tear, cut, missing material, or similarly structural issue." checked={draft.structuralDamage} onChange={setDraftValue("structuralDamage")} />
    <button type="button" className="secondary-button" onClick={add}>Add observation</button>
    {observations.length ? <ul className="code3-observation-list">{observations.map((row, index) => <li key={row.observationId || index}><span><strong>{optionLabel(row.defectType)}</strong><small>{optionLabel(row.severity)} · {optionLabel(row.side)} · {optionLabel(row.confidence)}</small></span><button type="button" className="ghost-button" aria-label={`Remove ${optionLabel(row.defectType)} ${optionLabel(row.side)} observation`} onClick={() => onChange(observations.filter((_, rowIndex) => rowIndex !== index))}>Remove</button></li>)}</ul> : <p className="flip-muted-copy">No defects recorded. That does not mean the card is near mint until usable front-and-back evidence is complete.</p>}
  </div>;
}

function IntelligenceResult({ result, history = [], comparison = null, ownerConfirmedCondition = "", ownerManualValue = null }) {
  if (!result) return null;
  const deal = result.dealIntelligence;
  const systemValue = result.valuation.conditionAdjustedValue || result.valuation.predictedResale?.median;
  const recommendationValue = deal?.expectedResaleValue || systemValue;
  const dealValueSource = deal?.assumptions?.valueSource || "UNAVAILABLE";
  const ownerResaleAssumption = dealValueSource === "OWNER_ASSUMPTION" || dealValueSource === "OWNER_CORRECTION";
  const value = ownerManualValue || recommendationValue;
  const recommendation = intelligenceRecommendation(deal?.recommendation);
  const condition = ownerConfirmedCondition || result.condition.proposedCondition || "Not enough information";
  const confidence = deal?.confidence || result.condition.confidence || INTELLIGENCE_CONFIDENCE.INSUFFICIENT;
  const details = [
    ["Condition", <div className="code3-intelligence-copy">{ownerConfirmedCondition ? <p><strong>Owner-confirmed condition:</strong> {ownerConfirmedCondition}</p> : null}<p><strong>System proposal:</strong> {result.condition.proposedCondition || "Not enough information"}</p><p>{result.condition.explanation}</p><p><strong>Visible evidence:</strong> {result.condition.visibleEvidence.length ? result.condition.visibleEvidence.map((row) => `${optionLabel(row.severity)} ${optionLabel(row.defectType)} (${optionLabel(row.side)})`).join(" · ") : "No supported defect observation"}</p><p><strong>Not assessable:</strong> {result.condition.defectsNotAssessable.length ? result.condition.defectsNotAssessable.join(" ") : "No documented limitation"}</p><p>Centering observations are reported separately and never determine condition by themselves. This is not a professional grade prediction.</p></div>],
    ["Value", <div className="code3-intelligence-copy">{ownerManualValue ? <p><strong>Owner-entered value:</strong> {formatMinorMoney(ownerManualValue)}</p> : null}<p><strong>System condition-adjusted estimate:</strong> {formatMinorMoney(result.valuation.conditionAdjustedValue)}</p><p><strong>Completed-sale center:</strong> {formatMinorMoney(result.valuation.completedSales.median)}</p><p><strong>Range:</strong> {formatMinorMoney(result.valuation.low)} to {formatMinorMoney(result.valuation.high)}</p><p>{result.valuation.sampleSize} verified completed sale{result.valuation.sampleSize === 1 ? "" : "s"}; {result.valuation.freshness.newestAgeDays == null ? "freshness unavailable" : `newest is ${result.valuation.freshness.newestAgeDays} days old`}.</p></div>],
    ["Comparable Evidence", <div className="code3-intelligence-copy"><p><strong>Completed sales:</strong> {result.valuation.sourceCoverage.completedSaleCount}</p><p><strong>Active listings:</strong> {result.valuation.sourceCoverage.activeListingCount} (asking prices only)</p><p><strong>Reference prices:</strong> {result.valuation.sourceCoverage.referencePriceCount}</p><p>Active listings and guide prices are never labeled completed-sale market value.</p></div>],
    ["Profit", <div className="code3-intelligence-copy">{deal ? <><p><strong>Acquisition:</strong> {formatMinorMoney(deal.estimatedAcquisitionCost)}</p><p><strong>Net proceeds:</strong> {formatMinorMoney(deal.expectedNetProceeds)}</p><p><strong>Net profit:</strong> {formatMinorMoney(deal.estimatedNetProfit)}</p><p><strong>ROI:</strong> {formatBasisPoints(deal.estimatedRoiBasisPoints)}</p></> : <p>Add asking price and resale assumptions to calculate advisory deal metrics.</p>}</div>],
    ["Risks", <div className="code3-intelligence-copy">{[...result.warnings, ...(deal?.risks || []).map((row) => row.explanation)].length ? <ul>{[...result.warnings, ...(deal?.risks || []).map((row) => row.explanation)].map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul> : <p>No recorded warning. Unseen defects and missing data can still change the result.</p>}</div>],
    [`Why ${BRAND_CONFIG.applicationDisplayName} thinks this`, <div className="code3-intelligence-copy"><p>{deal?.rationale || result.condition.explanation}</p><p>Method: {result.methodologyVersion}. Recommendation is advisory only and cannot purchase, offer, or bid.</p></div>],
    ["History", <div className="code3-intelligence-copy">{comparison ? <p className="code3-history-comparison">{comparison.summary}</p> : null}{history.length ? <ol className="code3-history-list">{history.map((record) => <li key={record.id}><strong>Revision {record.revision}</strong><span>{new Date(record.analyzedAt).toLocaleString()} · System: {record.systemResult?.condition?.proposedCondition || "No proposal"} · Owner: {record.ownerReview?.ownerConfirmedCondition || "Not confirmed"}</span></li>)}</ol> : <p>Save this result to begin append-only local analysis history.</p>}</div>],
  ];
  return <section className="code3-intelligence-result" aria-label={`${BRAND_CONFIG.applicationDisplayName} intelligence result`} data-recommendation={deal?.recommendation || "INSUFFICIENT_DATA"} data-analyzed-at={result.analyzedAt || undefined}>
    <div className="code3-intelligence-identity"><span>Identified item</span><h2>{result.identity.productName || "Identity needs owner review"}</h2><p>{[result.identity.set, result.identity.cardNumber, result.identity.variant].filter(Boolean).join(" · ") || "Card details are incomplete"}</p></div>
    <div className="code3-intelligence-answer">
      <div><span>{ownerConfirmedCondition ? "Owner condition" : "Condition"}</span><strong>{condition}</strong></div>
      <div><span>{ownerManualValue ? "Owner value" : ownerResaleAssumption ? "Owner resale assumption" : "Estimated value"}</span><strong>{formatMinorMoney(value)}</strong></div>
      <div><span>Asking price</span><strong>{formatMinorMoney(deal?.askingPrice)}</strong></div>
      <div><span>{BRAND_CONFIG.applicationDisplayName}</span><strong>{recommendation}</strong></div>
      <div><span>Estimated net</span><strong>{formatMinorMoney(deal?.estimatedNetProfit)}</strong></div>
      <div><span>Confidence</span><strong>{optionLabel(confidence)}</strong></div>
    </div>
    <p className="code3-intelligence-advisory">Advisory only. This result cannot purchase, submit an offer, or place a bid.{ownerResaleAssumption ? " The recommendation uses an owner-entered resale assumption at LOW confidence, not the completed-sale estimate." : ""}{ownerConfirmedCondition || ownerManualValue ? ` Owner-reviewed fields are shown above. System proposal: ${result.condition.proposedCondition || "not enough information"} / ${formatMinorMoney(systemValue)}. The recommendation remains the recorded system result.` : ""}</p>
    <div className="code3-intelligence-details">{details.map(([label, children]) => <details key={label} name="code3-intelligence-details"><summary>{label}</summary>{children}</details>)}</div>
  </section>;
}

export default function AppraiserScreen({ seed, onSave, repository = null, analysisHistory: suppliedAnalysisHistory = null, analysisRecords = [], onAnalysisStored }) {
  const draft = useMemo(loadDraft, []);
  const resumedAnalysis = !seed && draft.analysisId
    ? analysisRecords.find((record) => record.id === draft.analysisId && record.recordType === "CODE3_INTELLIGENCE_ANALYSIS") || null
    : null;
  const resumedAnalysisMatchesDraft = formMatchesStoredAnalysis(draft.form, resumedAnalysis);
  const [form, setForm] = useState(() => ({ ...draft.form, ...(seed || {}) }));
  const [step, setStep] = useState(draft.step);
  const [savedMessage, setSavedMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [intelligenceResult, setIntelligenceResult] = useState(() => resumedAnalysisMatchesDraft ? resumedAnalysis?.systemResult || null : null);
  const [intelligenceError, setIntelligenceError] = useState("");
  const [currentAnalysis, setCurrentAnalysis] = useState(() => resumedAnalysis);
  const [comparison, setComparison] = useState(null);
  const pendingResumeAnalysisIdRef = useRef(!seed && !resumedAnalysis ? draft.analysisId : null);
  const analysisRequestIdRef = useRef(0);
  const openSavedRequestIdRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const pipeline = useMemo(() => createCardAnalysisPipeline(), []);
  const analysisHistory = useMemo(() => suppliedAnalysisHistory || (repository ? createLocalAnalysisHistory({ repository }) : null), [repository, suppliedAnalysisHistory]);
  useEffect(() => {
    const pendingId = pendingResumeAnalysisIdRef.current;
    if (!pendingId || currentAnalysis) return;
    const record = analysisRecords.find((candidate) => candidate.id === pendingId && candidate.recordType === "CODE3_INTELLIGENCE_ANALYSIS");
    if (!record) return;
    const matchesStoredView = formMatchesStoredAnalysis(form, record);
    if (matchesStoredView) {
      analysisRequestIdRef.current += 1;
      setIntelligenceResult(record.systemResult || null);
    }
    pendingResumeAnalysisIdRef.current = null;
    setCurrentAnalysis(record);
  }, [analysisRecords, currentAnalysis, form]);
  useEffect(() => {
    if (seed) {
      pendingResumeAnalysisIdRef.current = null;
      setForm((current) => ({ ...current, ...seed }));
      setStep(0);
      setCurrentAnalysis(null);
      setComparison(null);
    }
  }, [seed]);
  useEffect(() => {
    try {
      window.sessionStorage?.setItem(DRAFT_KEY, JSON.stringify({ form, step, analysisId: currentAnalysis?.id || null }));
    } catch {
      // The workflow remains usable when session storage is unavailable.
    }
  }, [currentAnalysis?.id, form, step]);
  useEffect(() => {
    const requestId = analysisRequestIdRef.current + 1;
    analysisRequestIdRef.current = requestId;
    if (currentAnalysis && formMatchesStoredAnalysis(form, currentAnalysis)) {
      setIntelligenceResult(currentAnalysis.systemResult || null);
      setIntelligenceError("");
      return undefined;
    }
    let active = true;
    try {
      const input = buildCardAnalysisInput(form);
      pipeline.analyze(input).then((next) => {
        if (!active || requestId !== analysisRequestIdRef.current) return;
        setIntelligenceResult(next);
        setIntelligenceError("");
      }).catch((error) => {
        if (!active || requestId !== analysisRequestIdRef.current) return;
        setIntelligenceResult(null);
        setIntelligenceError(error?.message || "The intelligence result could not be calculated.");
      });
    } catch (error) {
      setIntelligenceResult(null);
      setIntelligenceError(error?.message || "Review the analysis inputs.");
    }
    return () => { active = false; };
  }, [currentAnalysis, form, pipeline]);
  const result = useMemo(() => analyzeListing(form), [form]);
  const currentHistory = useMemo(() => currentAnalysis
    ? analysisRecords.filter((record) => record.analysisSeriesId === currentAnalysis.analysisSeriesId).sort((left, right) => Number(right.revision) - Number(left.revision))
    : [], [analysisRecords, currentAnalysis]);
  const latestSavedAnalyses = useMemo(() => {
    const seen = new Set();
    return [...analysisRecords]
      .sort((left, right) => String(right.analyzedAt || "").localeCompare(String(left.analyzedAt || "")))
      .filter((record) => {
        if (!record.analysisSeriesId || seen.has(record.analysisSeriesId)) return false;
        seen.add(record.analysisSeriesId);
        return true;
      })
      .slice(0, 12);
  }, [analysisRecords]);
  const recommendation = intelligenceResult?.dealIntelligence
    ? intelligenceRecommendation(intelligenceResult.dealIntelligence.recommendation)
    : displayRecommendation(result.label);
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));
  const riskCount = String(form.riskNotes || "").split(/[,\n]/).map((value) => value.trim()).filter(Boolean).length;
  const missingInformation = [
    !String(form.title || "").trim() && !String(form.listingUrl || "").trim() ? "Listing title or URL" : "",
    !Number(form.purchasePrice) ? "Asking price" : "",
    !Number(form.expectedResaleMidpoint) ? "Expected resale midpoint" : "",
    form.sellingFeePercentage === "" ? "Selling fee percentage" : "",
    form.minimumDesiredProfit === "" ? "Minimum desired profit" : "",
    form.minimumDesiredRoi === "" ? "Minimum desired ROI" : "",
  ].filter(Boolean);

  const openSavedAnalysis = async (record) => {
    if (saveInFlightRef.current) return;
    const openRequestId = openSavedRequestIdRef.current + 1;
    openSavedRequestIdRef.current = openRequestId;
    analysisRequestIdRef.current += 1;
    pendingResumeAnalysisIdRef.current = null;
    setCurrentAnalysis(record);
    setForm(formFromStoredAnalysis(record));
    setIntelligenceResult(record.systemResult || null);
    setStep(4);
    setSavedMessage(`Opened revision ${record.revision}. Saving again will append a new local revision.`);
    try {
      const nextComparison = record.previousAnalysisId && analysisHistory ? await analysisHistory.compareWithPrevious(record.id) : null;
      if (openRequestId === openSavedRequestIdRef.current) setComparison(nextComparison);
    } catch {
      if (openRequestId === openSavedRequestIdRef.current) setComparison(null);
    }
  };

  const save = async (event) => {
    event?.preventDefault?.();
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setIsSaving(true);
    setSavedMessage("Saving analysis…");
    try {
      let pendingOwnerCorrection = null;
      if (form.ownerReviewConfirmed) {
        const manualEstimatedValue = optionalMoney(form.ownerManualEstimatedValue, "ownerManualEstimatedValue");
        pendingOwnerCorrection = {
          confirmedCondition: form.ownerConfirmedCondition || null,
          manualValues: { estimatedValue: manualEstimatedValue },
          dismissedWarningCodes: form.dismissedWarningCodes || [],
          note: form.ownerCorrectionNote || "Owner reviewed the saved analysis.",
          reviewStatus: "CONFIRMED",
        };
      }
      const normalizedInput = buildCardAnalysisInput(form);
      const nextResult = await pipeline.analyze(normalizedInput);
      setIntelligenceResult(nextResult);
      if (analysisHistory) {
        const payload = {
          analysisType: nextResult.analysisType,
          methodologyVersion: nextResult.methodologyVersion,
          inputHash: nextResult.inputHash,
          normalizedInput: nextResult.normalizedInput,
          workflowSnapshot: form,
          sourceReferences: [form.listingUrl].filter(Boolean),
          evidence: nextResult.evidence,
          warnings: nextResult.warnings,
          systemResult: nextResult,
          analyzedAt: nextResult.analyzedAt,
        };
        let stored = currentAnalysis
          ? await analysisHistory.reanalyze(currentAnalysis.id, payload)
          : await analysisHistory.createAnalysis(payload);
        if (pendingOwnerCorrection) {
          try {
            stored = await analysisHistory.recordOwnerCorrection(stored.id, pendingOwnerCorrection, stored.recordVersion);
          } catch (correctionError) {
            setCurrentAnalysis(stored);
            setComparison(stored.previousAnalysisId ? await analysisHistory.compareWithPrevious(stored.id) : null);
            onAnalysisStored?.(stored);
            setSavedMessage(`Analysis revision saved, but the owner review was not saved: ${correctionError?.message || "review failed"}. Correct the review fields and save again.`);
            return;
          }
        }
        setCurrentAnalysis(stored);
        setComparison(stored.previousAnalysisId ? await analysisHistory.compareWithPrevious(stored.id) : null);
        setForm((current) => ({ ...current, ownerReviewConfirmed: false }));
        onAnalysisStored?.(stored);
      } else {
        const record = {
          ...form,
          recommendation: result.label,
          landedCost: result.landedCost,
          expectedProfit: result.midpoint.profit,
          expectedRoi: result.midpoint.roi,
          maximumRecommendedPurchasePrice: result.maximumBasePurchasePrice,
          result,
          intelligenceResult: nextResult,
        };
        if (typeof onSave !== "function") throw new Error("Analysis storage is unavailable.");
        const saved = await onSave("appraisals", record, { title: "Deal analysis saved", detail: `${record.title || "Untitled listing"} · ${recommendation}` });
        if (!saved) throw new Error("The analysis was not saved. Your inputs remain available to review and try again.");
      }
      setSavedMessage(currentAnalysis ? "Reanalysis saved. The prior result remains in local history." : "Analysis saved with its evidence, assumptions, and result.");
    } catch (error) {
      setSavedMessage(error?.message || "The analysis could not be saved.");
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  const clear = () => {
    if (saveInFlightRef.current) return;
    openSavedRequestIdRef.current += 1;
    pendingResumeAnalysisIdRef.current = null;
    setForm(blankAppraisal());
    setStep(0);
    setSavedMessage("");
    setCurrentAnalysis(null);
    setComparison(null);
    window.sessionStorage?.removeItem(DRAFT_KEY);
  };

  return (
    <div className="flip-screen flip-analysis-workflow">
      <section className="flip-section">
        <SectionHeading title="Deal Analysis" />
        {latestSavedAnalyses.length ? <details className="code3-saved-analyses"><summary>Saved analysis history ({latestSavedAnalyses.length})</summary><ul className="code3-history-list">{latestSavedAnalyses.map((record) => <li key={record.id}><span><strong>{record.systemResult?.identity?.productName || record.workflowSnapshot?.title || "Untitled analysis"}</strong><small>Revision {record.revision} · {new Date(record.analyzedAt).toLocaleString()}</small></span><button type="button" className="secondary-button" disabled={isSaving} onClick={() => openSavedAnalysis(record)}>Open</button></li>)}</ul></details> : null}
        <nav className="flip-analysis-steps" aria-label="Deal Analysis progress">
          {STEPS.map((label, index) => <button key={label} type="button" className={index === step ? "is-active" : index < step ? "is-complete" : ""} aria-current={index === step ? "step" : undefined} disabled={isSaving || index > step} onClick={() => setStep(index)}><span>{index + 1}</span><strong>{label}</strong></button>)}
        </nav>

        <form className="flip-form" onSubmit={save}>
          {step === 0 ? <section className="flip-analysis-step" aria-labelledby="analysis-listing-title"><div><span>Step 1 of 5</span><h2 id="analysis-listing-title">Listing</h2><p>Capture enough source context to recognize the opportunity later.</p></div><div className="flip-form-grid"><TextInput label="Marketplace" value={form.marketplace} onChange={set("marketplace")} /><TextInput label="Listing URL" type="url" value={form.listingUrl} onChange={set("listingUrl")} /><TextInput label="Title" value={form.title} onChange={set("title")} /><TextArea label="Description" value={form.description} onChange={set("description")} /></div></section> : null}

          {step === 1 ? <section className="flip-analysis-step" aria-labelledby="analysis-item-title">
            <div><span>Step 2 of 5</span><h2 id="analysis-item-title">Item Details</h2><p>Record identity and only the condition evidence you can actually observe.</p></div>
            <div className="flip-form-grid">
              <SelectInput label="Product classification" value={form.productClassification} onChange={set("productClassification")} options={PRODUCT_CLASSIFICATIONS} />
              <TextInput label="Set" value={form.cardSet} onChange={set("cardSet")} />
              <TextInput label="Card number" value={form.cardNumber} onChange={set("cardNumber")} />
              <TextInput label="Language" value={form.cardLanguage} onChange={set("cardLanguage")} />
              <TextInput label="Variant" value={form.cardVariant} onChange={set("cardVariant")} />
              <TextInput label="Printing / edition" value={form.printingOrEdition} onChange={set("printingOrEdition")} />
              <SelectInput label="Raw or slabbed" value={form.cardFormat} onChange={set("cardFormat")} options={Object.values(CARD_FORMAT).map((value) => ({ value, label: optionLabel(value) }))} />
              {form.cardFormat === CARD_FORMAT.SLABBED ? <><TextInput label="Grading company" value={form.gradingCompany} onChange={set("gradingCompany")} /><TextInput label="Recorded grade" value={form.grade} onChange={set("grade")} /><TextInput label="Certification number" value={form.certificationNumber} onChange={set("certificationNumber")} /></> : null}
              <SelectInput label="Identity confidence" value={form.identityConfidence} onChange={set("identityConfidence")} options={Object.values(INTELLIGENCE_CONFIDENCE).map((value) => ({ value, label: optionLabel(value) }))} />
              <TextArea label="Item notes" value={form.itemNotes} onChange={set("itemNotes")} />
              <SelectInput label="Risk severity" value={form.riskSeverity} onChange={set("riskSeverity")} options={["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((value) => ({ value, label: optionLabel(value) }))} />
              <TextArea label="Risk notes" helper="Separate risk flags with commas or new lines. The selected severity limits the advisory recommendation." value={form.riskNotes} onChange={set("riskNotes")} />
            </div>
            <details className="code3-evidence-disclosure">
              <summary>Image evidence</summary>
              <p>Image references stay with this local record. Enter only evidence you personally verified; no automated image assessment or professional grade prediction is performed.</p>
              <div className="flip-form-grid">
                <TextInput label="Front image reference" value={form.frontImageReference} onChange={set("frontImageReference")} placeholder="Local or provider reference" />
                <SelectInput label="Front image quality" value={form.frontImageQuality} onChange={set("frontImageQuality")} options={Object.values(INTELLIGENCE_CONFIDENCE).map((value) => ({ value, label: optionLabel(value) }))} />
                <TextInput label="Back image reference" value={form.backImageReference} onChange={set("backImageReference")} placeholder="Local or provider reference" />
                <SelectInput label="Back image quality" value={form.backImageQuality} onChange={set("backImageQuality")} options={Object.values(INTELLIGENCE_CONFIDENCE).map((value) => ({ value, label: optionLabel(value) }))} />
              </div>
              <div className="code3-image-effects" aria-label="Image limitations">
                <CheckField label="Front glare" checked={form.frontGlare} onChange={set("frontGlare")} />
                <CheckField label="Front sleeve" checked={form.frontSleeve} onChange={set("frontSleeve")} />
                <CheckField label="Front toploader" checked={form.frontToploader} onChange={set("frontToploader")} />
                <CheckField label="Front blur / low resolution" checked={form.frontBlur || form.frontLowResolution} onChange={(value) => setForm((current) => ({ ...current, frontBlur: value, frontLowResolution: value }))} />
                <CheckField label="Back glare" checked={form.backGlare} onChange={set("backGlare")} />
                <CheckField label="Back sleeve" checked={form.backSleeve} onChange={set("backSleeve")} />
                <CheckField label="Back toploader" checked={form.backToploader} onChange={set("backToploader")} />
                <CheckField label="Back blur / low resolution" checked={form.backBlur || form.backLowResolution} onChange={(value) => setForm((current) => ({ ...current, backBlur: value, backLowResolution: value }))} />
              </div>
              <CheckField label="Front-and-back inspection complete" helper="Check only after the available evidence supports a complete visual inspection." checked={form.inspectionComplete} onChange={set("inspectionComplete")} />
            </details>
            <details className="code3-evidence-disclosure">
              <summary>Condition observations</summary>
              <DefectObservationEditor observations={form.defectObservations || []} onChange={set("defectObservations")} />
            </details>
          </section> : null}

          {step === 2 ? <section className="flip-analysis-step" aria-labelledby="analysis-cost-title"><div><span>Step 3 of 5</span><h2 id="analysis-cost-title">Purchase Costs</h2><p>Landed cost includes every recorded acquisition cost, not only the asking price.</p></div><div className="flip-form-grid"><MoneyInput label="Asking price" value={form.purchasePrice} onChange={set("purchasePrice")} /><MoneyInput label="Shipping" value={form.purchaseShipping} onChange={set("purchaseShipping")} /><MoneyInput label="Tax estimate" value={form.purchaseTax} onChange={set("purchaseTax")} /><MoneyInput label="Buyer premium" value={form.buyerPremium} onChange={set("buyerPremium")} /><MoneyInput label="Fixed buyer fees" value={form.fixedBuyerFees} onChange={set("fixedBuyerFees")} /><MoneyInput label="Pickup / travel" value={form.travelOrPickupCost} onChange={set("travelOrPickupCost")} /><MoneyInput label="Preparation / cleaning" value={form.preparationCost} onChange={set("preparationCost")} /><MoneyInput label="Other acquisition costs" value={form.otherAcquisitionCosts} onChange={set("otherAcquisitionCosts")} /></div><div className="flip-live-total"><span>Current landed-cost estimate</span><strong>{formatCurrency(result.landedCost)}</strong></div></section> : null}

          {step === 3 ? <section className="flip-analysis-step" aria-labelledby="analysis-resale-title">
            <div><span>Step 4 of 5</span><h2 id="analysis-resale-title">Resale Assumptions</h2><p>Use researched assumptions. Active asking prices remain separate from verified completed sales.</p></div>
            <div className="flip-form-grid">
              <MoneyInput label="Expected resale low" value={form.expectedResaleLow} onChange={set("expectedResaleLow")} />
              <MoneyInput label="Expected resale midpoint" value={form.expectedResaleMidpoint} onChange={set("expectedResaleMidpoint")} />
              <MoneyInput label="Expected resale high" value={form.expectedResaleHigh} onChange={set("expectedResaleHigh")} />
              <TextInput label="Expected selling platform" value={form.expectedSellingPlatform} onChange={set("expectedSellingPlatform")} />
              <TextInput label="Selling fee percentage" helper="Enter 13.25 for 13.25%." type="number" inputMode="decimal" min="0" max="100" step="0.01" value={form.sellingFeePercentage} onChange={set("sellingFeePercentage")} />
              <MoneyInput label="Fixed selling fees" value={form.fixedSellingFees} onChange={set("fixedSellingFees")} />
              <MoneyInput label="Outbound shipping" value={form.outboundShipping} onChange={set("outboundShipping")} />
              <MoneyInput label="Packaging cost" value={form.packagingCost} onChange={set("packagingCost")} />
              <MoneyInput label="Return / fraud reserve" value={form.returnOrFraudReserve} onChange={set("returnOrFraudReserve")} />
              <MoneyInput label="Other selling costs" value={form.otherSellingCosts} onChange={set("otherSellingCosts")} />
              <MoneyInput label="Minimum desired profit" value={form.minimumDesiredProfit} onChange={set("minimumDesiredProfit")} />
              <TextInput label="Minimum desired ROI" helper="Enter 30 for 30%." type="number" inputMode="decimal" min="0" step="0.1" value={form.minimumDesiredRoi} onChange={set("minimumDesiredRoi")} />
            </div>
            <details className="code3-evidence-disclosure">
              <summary>Comparable evidence</summary>
              <p>Enter one claimed completed sale per line as amount | sale date | source reference | condition. A source reference is required before an entry can be marked verified. Condition must be NM, LP, MP, HP, or DMG; unknown-condition sales are retained but cannot drive a condition-specific estimate.</p>
              <TextArea label="Completed-sale references" helper="Example: 42.00 | 2026-08-01 | provider-record-123 | LP" value={form.completedSalesText} onChange={set("completedSalesText")} rows={4} />
              <CheckField label="I verified these as completed sales" helper="Do not check this for active listings or guide prices." checked={form.completedSalesVerified} onChange={set("completedSalesVerified")} />
            </details>
          </section> : null}

          {step === 4 ? <section className="flip-analysis-step ops-decision-panel" aria-labelledby="analysis-decision-title">
            <h2 id="analysis-decision-title" className="sr-only">Analysis result</h2>
            {intelligenceError ? <div className="flip-storage-warning" role="alert"><strong>Analysis needs review</strong><span>{intelligenceError}</span></div> : null}
            {!intelligenceError && !intelligenceResult ? <p className="flip-form-message" role="status">Calculating the advisory result…</p> : null}
            <IntelligenceResult result={intelligenceResult} history={currentHistory.slice(0, 12)} comparison={comparison} ownerConfirmedCondition={form.ownerConfirmedCondition} ownerManualValue={safeOwnerMoney(form.ownerManualEstimatedValue)} />
            <details className="code3-owner-review">
              <summary>Owner review and correction</summary>
              <p>The system proposal remains in history. Your confirmation is stored separately and is carried forward for review—not silently applied as a new system result. Identity and variant edits are retained as owner-entered input in the next revision.</p>
              <div className="flip-form-grid">
                <SelectInput label="Owner-confirmed condition" value={form.ownerConfirmedCondition} onChange={(value) => setForm((current) => ({ ...current, ownerConfirmedCondition: value, ownerReviewConfirmed: true }))} options={[{ value: "", label: "Not confirmed" }, ...Object.values(CARD_CONDITION).map((value) => ({ value, label: value }))]} />
                <MoneyInput label="Owner-entered value" helper="Stored separately from the system estimate." value={form.ownerManualEstimatedValue} onChange={(value) => setForm((current) => ({ ...current, ownerManualEstimatedValue: value, ownerReviewConfirmed: Boolean(value || current.ownerConfirmedCondition || (current.dismissedWarningCodes || []).length) }))} />
                <TextArea label="Correction note" value={form.ownerCorrectionNote} onChange={set("ownerCorrectionNote")} />
              </div>
              {intelligenceResult?.warnings?.length ? <fieldset className="code3-warning-review"><legend>Warning review</legend>{intelligenceResult.warnings.map((warning) => { const code = warningCode(warning); return <CheckField key={code} label={warning} helper="Dismiss only after owner review; the original warning remains in system history." checked={(form.dismissedWarningCodes || []).includes(code)} onChange={(checked) => setForm((current) => ({ ...current, ownerReviewConfirmed: true, dismissedWarningCodes: checked ? [...new Set([...(current.dismissedWarningCodes || []), code])] : (current.dismissedWarningCodes || []).filter((value) => value !== code) }))} />; })}</fieldset> : null}
              {(form.ownerConfirmedCondition || form.ownerManualEstimatedValue || (form.dismissedWarningCodes || []).length) ? <CheckField label="Confirm owner review for this revision" helper="Reanalysis carries prior owner values for review but never silently reconfirms them." checked={form.ownerReviewConfirmed} onChange={set("ownerReviewConfirmed")} /> : null}
            </details>
            <button type="button" className="primary-button flip-decision-primary" disabled={isSaving} aria-busy={isSaving || undefined} onClick={save}>{isSaving ? "Saving…" : currentAnalysis ? "Save reanalysis" : "Save analysis"}</button>
            <details className="code3-compatibility-calculation">
              <summary>Show calculation scenarios</summary>
              <div className="flip-result-title"><span>Previous calculation comparison</span><StatusPill tone={recommendationTone(result.label)}>{displayRecommendation(result.label)}</StatusPill><h3>{form.title || "Current assumptions"}</h3></div>
              <div className="flip-decision-priority"><article><span>Maximum offer</span><strong>{formatCurrency(result.maximumRecommendedOffer)}</strong></article><article><span>Landed cost</span><strong>{formatCurrency(result.landedCost)}</strong></article><article><span>Expected profit</span><strong>{formatCurrency(result.midpoint.profit)}</strong></article><article><span>Expected ROI</span><strong>{formatPercent(result.midpoint.roi)}</strong></article></div>
              <div className="ops-indicator-row"><ConfidenceIndicator value={result.confidence} /><RiskIndicator value={riskCount ? `${riskCount} flag${riskCount === 1 ? "" : "s"}` : "No flags entered"} /></div>
              <div className="flip-scenario-table" role="table" aria-label="Low midpoint and high appraisal outcomes"><div role="row" className="flip-scenario-table__head"><span>Scenario</span><span>Net proceeds</span><span>Profit</span><span>ROI</span></div>{[["Low", result.low], ["Midpoint", result.midpoint], ["High", result.high]].map(([label, row]) => <div role="row" key={label}><strong>{label}<small>{formatCurrency(row.expectedResalePrice)} resale</small></strong><span>{formatCurrency(row.netProceeds)}</span><span className={row.profit >= 0 ? "flip-positive" : "flip-negative"}>{formatCurrency(row.profit)}</span><span>{formatPercent(row.roi)}</span></div>)}</div>
              <div className="flip-calculation-explanation"><p>{result.explanation}</p><p>Net proceeds subtract selling fees, outbound shipping, packaging, reserves, and other selling costs. Missing information: {missingInformation.length ? missingInformation.join(", ") : "none in the legacy calculation"}.</p></div>
            </details>
          </section> : null}

          {savedMessage ? <p className="flip-form-message" role="status">{savedMessage}</p> : null}
          <FormActions>
            {step > 0 ? <button type="button" className="secondary-button" disabled={isSaving} onClick={() => setStep((current) => Math.max(0, current - 1))}>Back</button> : null}
            {step < 4 ? <button type="button" className="primary-button" disabled={isSaving} onClick={() => setStep((current) => Math.min(4, current + 1))}>Continue</button> : null}
            <button type="button" className="ghost-button" disabled={isSaving} onClick={clear}>Clear</button>
          </FormActions>
        </form>
      </section>
      {step === 4 ? <StickyDecisionBar recommendation={recommendation} action={<button type="button" className="ops-button ops-button--primary" disabled={isSaving} aria-busy={isSaving || undefined} onClick={save}>{isSaving ? "Saving…" : "Save decision"}</button>} /> : null}
    </div>
  );
}
