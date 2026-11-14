// Module worker: serialises export rows to CSV (COULD 37). Keep it dependency
// free so it starts instantly and never pulls app code into the worker bundle.
import { rowsToCsv } from "./csv.js";

self.onmessage = (event) => {
  const { type, rows } = event.data || {};
  if (type !== "csv") return;
  try { self.postMessage({ csv: rowsToCsv(Array.isArray(rows) ? rows : []) }); } catch (error) { self.postMessage({ error: String(error?.message || error) }); }
};
