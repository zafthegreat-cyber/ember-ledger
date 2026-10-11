import { useEffect, useRef, useState } from "react";
import {
  MetricCard,
  RecordCard,
  SectionHeader,
  StatusBadge,
} from "../../../components/operations/OperationsUI.jsx";
import { formatMoneyForDisplay } from "../../intelligence/money.js";
import {
  STELLAR_PREVIEW_FORMAT_STATES,
  STELLAR_PREVIEW_LIMITS,
} from "./constants.js";
import {
  createStellarTaskExportPreviewFromFile,
  stellarPreviewBasename,
} from "./preview.js";
import "./stellar-task-export-preview.css";

function words(value) {
  return String(value || "Unknown")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return "Unknown size";
  if (value < 1024) return `${value} bytes`;
  return `${(value / 1024).toFixed(1)} KB`;
}

function statusTone(state) {
  if (state === STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED) return "warning";
  if (state === STELLAR_PREVIEW_FORMAT_STATES.UNSAFE || state === STELLAR_PREVIEW_FORMAT_STATES.REJECTED) return "danger";
  return "neutral";
}

function previewProductIdentity(task) {
  const fields = [
    ["Product ID", task.product.productIdentifier.value],
    ["SKU", task.product.sku.value],
    ["UPC", task.product.upc.value],
    ["GTIN", task.product.gtin.value],
    ["TCIN", task.product.tcin.value],
  ];
  return fields.find(([, value]) => value) || ["Product", "Not recognized"];
}

function PreviewTaskCard({ task }) {
  const [productKind, productValue] = previewProductIdentity(task);
  return (
    <RecordCard className="stellar-preview-task">
      <div className="stellar-preview-task-heading">
        <div>
          <p className="eyebrow">Non-authoritative task preview</p>
          <h4>{task.taskLabel.value || task.product.title.value || `Task ${task.previewIndex + 1}`}</h4>
        </div>
        <StatusBadge tone={task.duplicate ? "warning" : "neutral"}>{task.duplicate ? "Duplicate" : words(task.mappingConfidence)}</StatusBadge>
      </div>
      <dl className="stellar-preview-task-facts">
        <div><dt>Retailer</dt><dd>{task.retailer.canonicalId ? task.retailer.sourceLabel : `${task.retailer.sourceLabel || "Not recognized"} · review`}</dd></div>
        <div><dt>{productKind}</dt><dd>{productValue}</dd></div>
        <div><dt>Quantity</dt><dd>{task.quantity.value ?? words(task.quantity.state)}</dd></div>
        <div><dt>Max price</dt><dd>{task.maxPrice.value ? formatMoneyForDisplay(task.maxPrice.value) : words(task.maxPrice.state)}</dd></div>
        <div><dt>Exported status · not live</dt><dd>{task.exportedStatus.value ? words(task.exportedStatus.value) : words(task.exportedStatus.state)}</dd></div>
        <div><dt>Group</dt><dd>{task.group.label || task.group.reference || "Not recognized"}</dd></div>
      </dl>
      {task.warnings.length ? <ul className="stellar-preview-warnings" aria-label="Task preview warnings">{task.warnings.map((warning) => <li key={warning}>{words(warning)}</li>)}</ul> : null}
      {task.ignoredFields.length ? <details><summary>Ignored fields</summary><p>{task.ignoredFields.join(", ")}</p></details> : null}
    </RecordCard>
  );
}

function PreviewResult({ preview }) {
  if (!preview) return null;
  const blocked = preview.formatRecognitionState === STELLAR_PREVIEW_FORMAT_STATES.UNSAFE;
  return (
    <div className="stellar-preview-result" data-testid="stellar-export-preview-result">
      <div className="stellar-preview-result-heading">
        <div>
          <p className="eyebrow">Ephemeral review</p>
          <h3>{preview.file.displayName}</h3>
          <p>{formatBytes(preview.file.sizeBytes)} · Nothing was imported or saved.</p>
        </div>
        <StatusBadge tone={statusTone(preview.formatRecognitionState)}>{words(preview.formatRecognitionState)}</StatusBadge>
      </div>

      {blocked ? (
        <div className="stellar-preview-blocked" role="alert">
          <h4>This file cannot be previewed</h4>
          <p>This file contains information that Code 3 does not allow in Bot Operations previews. Normalization stopped before any task metadata was produced.</p>
          <ul>{preview.blockingSecurityFindings.map((finding) => <li key={finding.category}>{finding.message}</li>)}</ul>
        </div>
      ) : null}

      {preview.securitySafe ? (
        <div className="stellar-preview-metrics" aria-label="Stellar export preview summary">
          <MetricCard label="Tasks detected" value={preview.summary.recordCount} helper="Selected file only" />
          <MetricCard label="Safe tasks recognized" value={preview.summary.safeRecognizedTaskCount} helper="Preview rows, not Bot Tasks" />
          <MetricCard label="Warnings" value={preview.summary.warningCount} helper={`${preview.summary.rejectedRecordCount} rejected records`} />
          <MetricCard label="Retailer labels" value={preview.summary.retailerCount} helper="Not verified provider coverage" />
        </div>
      ) : null}

      {preview.compatibilityNotes.length ? <ul className="stellar-preview-notes" aria-label="Format compatibility notes">{preview.compatibilityNotes.map((note) => <li key={note}>{note}</li>)}</ul> : null}
      {preview.safeToPreview && preview.ignoredFields.length ? <p className="stellar-preview-ignored"><strong>Ignored unknown fields:</strong> {preview.ignoredFields.join(", ")}</p> : null}
      {preview.safeToPreview && preview.warnings.length ? <ul className="stellar-preview-warnings" aria-label="Preview warnings">{preview.warnings.map((warning) => <li key={warning}>{words(warning)}</li>)}</ul> : null}
      {preview.safeToPreview && preview.tasks.length ? <div className="stellar-preview-task-grid">{preview.tasks.map((task) => <PreviewTaskCard key={task.previewIndex} task={task} />)}</div> : null}
      {preview.safeToPreview && !preview.tasks.length ? <p className="stellar-preview-empty">No safely recognizable task rows were found. Nothing was imported.</p> : null}
    </div>
  );
}

export default function StellarTaskExportPreview() {
  const fileInputRef = useRef(null);
  const selectedFileRef = useRef(null);
  const requestGenerationRef = useRef(0);
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [readError, setReadError] = useState("");

  useEffect(() => () => {
    requestGenerationRef.current += 1;
    selectedFileRef.current = null;
  }, []);

  const clearFileInput = () => {
    selectedFileRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const discard = () => {
    requestGenerationRef.current += 1;
    clearFileInput();
    setSelectedFile(null);
    setPreview(null);
    setReadError("");
    setBusy(false);
  };

  const chooseFile = (event) => {
    requestGenerationRef.current += 1;
    setBusy(false);
    const file = event.currentTarget.files?.[0] || null;
    selectedFileRef.current = file;
    setPreview(null);
    setReadError("");
    setSelectedFile(file ? {
      displayName: stellarPreviewBasename(file.name),
      sizeBytes: file.size,
    } : null);
  };

  const previewFile = async () => {
    const file = selectedFileRef.current;
    if (!file || busy) return;
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    setBusy(true);
    setReadError("");
    try {
      const result = await createStellarTaskExportPreviewFromFile(file);
      if (requestGenerationRef.current !== generation) return;
      setPreview(result);
      setSelectedFile(null);
      clearFileInput();
    } catch {
      if (requestGenerationRef.current !== generation) return;
      setReadError("The selected file could not be read safely. Choose another JSON file.");
      clearFileInput();
      setSelectedFile(null);
    } finally {
      if (requestGenerationRef.current === generation) setBusy(false);
    }
  };

  return (
    <section className="stellar-preview" aria-label="Stellar task export offline preview" data-testid="stellar-export-preview">
      <SectionHeader
        eyebrow="Offline Preview"
        title="Preview Stellar Export"
        description="Review an owner-selected Stellar task JSON locally before Code 3 supports importing anything. The published Stellar schema is not verified."
      />
      <div className="stellar-preview-boundary">
        <p id="stellar-preview-help">Choose one JSON file explicitly. Code 3 does not scan folders, connect to Stellar, retain the raw file, or write preview data to storage.</p>
        <input
          ref={fileInputRef}
          id="stellar-export-file"
          data-testid="stellar-export-file-input"
          type="file"
          accept=".json,application/json"
          aria-label={preview || selectedFile ? "Choose another Stellar JSON file" : "Choose Stellar JSON file"}
          aria-describedby="stellar-preview-help stellar-preview-limit"
          disabled={busy}
          onChange={chooseFile}
        />
        <p id="stellar-preview-limit" className="stellar-preview-limit">JSON only · maximum {STELLAR_PREVIEW_LIMITS.maximumFileBytes / (1024 * 1024)} MB · maximum {STELLAR_PREVIEW_LIMITS.maximumRecords} task records</p>
        {selectedFile ? <p className="stellar-preview-selection" aria-live="polite">Selected: <strong>{selectedFile.displayName}</strong> · {formatBytes(selectedFile.sizeBytes)}</p> : null}
        <div className="stellar-preview-actions">
          <button type="button" onClick={previewFile} disabled={!selectedFile || busy}>{busy ? "Reviewing safely…" : "Preview File"}</button>
          {preview || selectedFile ? <button type="button" className="secondary" onClick={discard}>Discard</button> : null}
        </div>
        <p className="stellar-preview-invariant">Stellar Export Preview ≠ Bot Task Import · Previewed Task ≠ Task</p>
        <p className="stellar-preview-status" aria-live="polite">{readError || (preview ? `${words(preview.formatRecognitionState)}. Preview remains in memory only.` : "No file is open.")}</p>
      </div>
      {readError ? <div className="stellar-preview-read-error" role="alert">{readError}</div> : null}
      <PreviewResult preview={preview} />
    </section>
  );
}
