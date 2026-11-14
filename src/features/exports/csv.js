// CSV serialisation off the main thread (COULD 37, 2026-11-14).
//
// `rowsToCsv` is the pure serializer (unchanged output from the old inline
// code in App.jsx, so existing exports are byte-identical). `rowsToCsvAsync`
// hands big exports to a module Worker so a 20k-row sales export does not
// freeze the phone; small exports stay synchronous. The worker is optional:
// if it cannot start, the main thread does the work exactly as before.

export const CSV_WORKER_THRESHOLD = 2000;

export function rowsToCsv(rows = []) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [headers.join(","), ...rows.map((row) => headers.map((h) => `"${String(row[h] ?? "").replaceAll('"', '""')}"`).join(","))].join("\n");
}

let workerFactory = () => new Worker(new URL("./csv.worker.js", import.meta.url), { type: "module", name: "Code 3 export writer" });

/** Test seam. */
export function setCsvWorkerFactory(factory) { workerFactory = factory; }

export function rowsToCsvAsync(rows = [], { threshold = CSV_WORKER_THRESHOLD, timeoutMs = 20000 } = {}) {
  if (!rows.length) return Promise.resolve("");
  if (rows.length < threshold || typeof Worker === "undefined") return Promise.resolve(rowsToCsv(rows));
  return new Promise((resolve) => {
    let worker;
    let settled = false;
    const finish = (csv) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { worker?.terminate(); } catch { /* ignore */ }
      resolve(csv);
    };
    const fallback = () => finish(rowsToCsv(rows));
    const timer = setTimeout(fallback, timeoutMs);
    try {
      worker = workerFactory();
      worker.onmessage = (event) => finish(typeof event.data?.csv === "string" ? event.data.csv : rowsToCsv(rows));
      worker.onerror = fallback;
      worker.postMessage({ type: "csv", rows });
    } catch {
      fallback();
    }
  });
}
