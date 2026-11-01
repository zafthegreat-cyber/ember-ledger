import { useMemo } from "react";
import { describeExport } from "../utils/exportDisclosure.mjs";
import "./export-disclosure.css";

// Improvement #97: a short statement, rendered next to an export button before
// the file exists, of what the file will contain and which parts are private.
// Pass `id` and point the button's aria-describedby at it so assistive tech
// reads the disclosure with the control.
export default function ExportDisclosure({ id, kind = "", format = "file", fields = [], rows = null, recordCount = null, redactions = [], includeValues = true, className = "" }) {
  const summary = useMemo(
    () => describeExport({ kind, format, fields, rows, recordCount, redactions, includeValues }),
    [kind, format, fields, rows, recordCount, redactions, includeValues],
  );
  return <p id={id} className={`export-disclosure${className ? ` ${className}` : ""}`} data-private={summary.containsPrivateData ? "true" : "false"}>
    <span className="export-disclosure__label">{summary.containsPrivateData ? "Private file" : "What's in this file"}</span>
    <span>{summary.sentence}</span>
  </p>;
}

// For message strings (toasts, status lines) use describeExport(...).sentence from
// ../utils/exportDisclosure.mjs so the same words appear after an export as before it.
