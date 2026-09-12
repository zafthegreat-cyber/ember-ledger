import { assertAnalysisInputHasNoAuthorityFields } from "../analysisHistory.js";

export const SCANNER_EVIDENCE_ADAPTER_VERSION = "code3.scanner-evidence-boundary.v1";

const PROVENANCE_KINDS = Object.freeze({
  MACHINE: "MACHINE_OBSERVED",
  PROVIDER: "PROVIDER_SUPPLIED",
  OWNER: "OWNER_ENTERED",
  INFERRED: "INFERRED",
});

function cleanText(value, maximum = 2_000) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}
function confidence(value, fallback = "LOW") {
  const normalized = cleanText(value, 20).toUpperCase();
  return ["HIGH", "MEDIUM", "LOW", "INSUFFICIENT"].includes(normalized) ? normalized : fallback;
}

function entriesFromRecord(record, provenanceKind, sourceId, defaultConfidence) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return [];
  return Object.entries(record)
    .filter(([key, value]) => !["confidence", "sourceId"].includes(key) && value !== "" && value != null)
    .map(([field, value]) => ({
      observationType: field.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase(),
      value,
      confidence: confidence(record.confidence, defaultConfidence),
      provenance: {
        kind: provenanceKind,
        sourceId: cleanText(record.sourceId, 200) || sourceId,
        independenceKey: cleanText(record.sourceId, 200) || sourceId,
      },
    }));
}

/**
 * Provider-neutral boundary for existing barcode/catalog/manual scanner data.
 * It deliberately performs no OCR, computer vision, condition inference, or
 * card-grade prediction.
 */
export function normalizeScannerEvidence(input = {}, options = {}) {
  assertAnalysisInputHasNoAuthorityFields(input);
  assertAnalysisInputHasNoAuthorityFields(options);

  const scanId = cleanText(input.scanId, 200) || "unidentified-scan";
  const observedAtValue = cleanText(input.observedAt || options.observedAt, 60);
  const observedAt = Number.isFinite(Date.parse(observedAtValue)) ? new Date(observedAtValue).toISOString() : null;
  const observations = [
    ...entriesFromRecord(input.barcode, PROVENANCE_KINDS.MACHINE, `scanner:${scanId}:barcode`, "MEDIUM"),
    ...entriesFromRecord(input.catalogMatch, PROVENANCE_KINDS.PROVIDER, `scanner:${scanId}:catalog`, "MEDIUM"),
    ...entriesFromRecord(input.providerEvidence, PROVENANCE_KINDS.PROVIDER, `scanner:${scanId}:provider`, "LOW"),
    ...entriesFromRecord(input.ownerEvidence, PROVENANCE_KINDS.OWNER, `scanner:${scanId}:owner`, "HIGH"),
    ...entriesFromRecord(input.inferredEvidence, PROVENANCE_KINDS.INFERRED, `scanner:${scanId}:inferred`, "LOW"),
  ];
  const imageReferences = Array.isArray(input.imageReferences)
    ? input.imageReferences.map((reference, index) => {
      const value = typeof reference === "string" ? { url: reference } : reference;
      return {
        referenceId: cleanText(value?.referenceId, 200) || `${scanId}:image:${index + 1}`,
        url: cleanText(value?.url, 2_000) || null,
        side: ["FRONT", "BACK", "OTHER"].includes(cleanText(value?.side, 20).toUpperCase())
          ? cleanText(value.side, 20).toUpperCase()
          : "OTHER",
        provenance: {
          kind: value?.ownerEntered === true ? PROVENANCE_KINDS.OWNER : PROVENANCE_KINDS.MACHINE,
          sourceId: `scanner:${scanId}:image-reference`,
          independenceKey: `scanner:${scanId}`,
        },
        imageAnalysisPerformed: false,
      };
    })
    : [];

  return Object.freeze({
    adapterVersion: SCANNER_EVIDENCE_ADAPTER_VERSION,
    sourceId: `scanner:${scanId}`,
    observedAt,
    observations,
    imageReferences,
    capabilities: {
      barcodeCapture: Boolean(input.barcode && Object.keys(input.barcode).length),
      catalogLookup: Boolean(input.catalogMatch && Object.keys(input.catalogMatch).length),
      ocr: false,
      computerVision: false,
      conditionAssessment: false,
      gradePrediction: false,
    },
    warnings: [
      ...(!observedAt ? [{ code: "MISSING_OBSERVED_AT", message: "The scan time is unavailable." }] : []),
      ...(imageReferences.length ? [{ code: "IMAGES_NOT_ANALYZED", message: "Image references were retained, but no image model or OCR analysis ran." }] : []),
    ],
    limitations: [
      "Barcode reads are machine observations; catalog matches remain provider-supplied evidence.",
      "Owner entries, provider data, scanner observations, and inferences remain separate provenance classes.",
      "This adapter does not claim computer-vision, OCR, authenticity, condition, or grading capabilities.",
    ],
  });
}
