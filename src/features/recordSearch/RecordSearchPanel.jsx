import { useEffect, useMemo, useState } from "react";
import { PageHeader, PrimaryButton, SearchField, StatusBadge } from "../../components/operations/OperationsUI.jsx";
import { DetailList, RecordDetailPage } from "../../components/operations/RecordExperience.jsx";
import { code3OwnerRequest } from "../../services/code3OwnerApi.js";
import { createRemoteBackupExportAdapter } from "../persistence/remoteBackupAdapter.js";
import { queryRecordIndex, readAuthorizedRecordIndex, recordSearchUrl } from "./recordIndex.js";
import AttachmentPanel from "../privateFiles/AttachmentPanel.jsx";
import "./record-search.css";

export default function RecordSearchPanel({ session, query = "", fullPage = false }) {
  const authorized = session?.status === "authorized" && session.ownerAuthorized === true;
  const stableIdentity = typeof session?.identityKey === "string" && (/^[a-f0-9]{64}$/.test(session.identityKey)
    || (session.localDevelopment === true && session.identityKey === "code3-local-development-owner"));
  const identityKey = stableIdentity ? session.identityKey : "";
  // Changing/revoking identity destroys indexed private records and pending work.
  if (!authorized) return fullPage ? <p role="status">Verified owner access is required to search private records.</p> : null;
  if (!identityKey) return <p role="alert">Owner identity could not be verified for private search. Refresh your session and try again.</p>;
  return <AuthorizedSearch key={identityKey} session={session} query={query} fullPage={fullPage} />;
}

function AuthorizedSearch({ session, query, fullPage }) {
  const [draft, setDraft] = useState(query);
  const [load, setLoad] = useState({ status: "loading", index: null, remote: null });
  const [remote, setRemote] = useState(null);
  const [remoteStatus, setRemoteStatus] = useState(() => fullPage && new URLSearchParams(globalThis.location?.search).get("source") === "canonical" ? "loading" : "");
  const [refresh, setRefresh] = useState(0);
  const adapter = useMemo(() => createRemoteBackupExportAdapter({ request: (path, init) => code3OwnerRequest(path, init, { localDevelopment: session.localDevelopment }) }), [session.localDevelopment]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      try {
        const index = readAuthorizedRecordIndex({ session, localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage, canonicalDomains: remote });
        if (active) setLoad({ status: "ready", index, remote });
      } catch { if (active) setLoad({ status: "error", index: null, remote }); }
    }, 50);
    return () => { active = false; clearTimeout(timer); };
  }, [session, remote, refresh]);
  useEffect(() => {
    const updated = () => setRefresh((value) => value + 1);
    window.addEventListener("storage", updated);
    return () => window.removeEventListener("storage", updated);
  }, []);
  useEffect(() => {
    if (remoteStatus !== "loading") return undefined;
    const controller = new AbortController();
    adapter.inspect({ signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      setRemote(result.included ? result.domains : null);
      setRemoteStatus(result.included ? (result.coverageStatus === "PARTIAL" ? "Server results are partial." : "Canonical server records included.") : result.reason || "Server records unavailable.");
    }).catch(() => { if (!controller.signal.aborted) setRemoteStatus("Server records unavailable."); });
    return () => controller.abort();
  }, [adapter, remoteStatus]);
  const results = load.index ? queryRecordIndex(load.index, query) : { groups: [], total: 0 };
  const params = new URLSearchParams(globalThis.location?.search);
  const detail = fullPage && params.has("record") ? load.index?.records.find((row) => row.id === params.get("record") && row.source === params.get("source") && row.collection === params.get("collection")) : null;
  const indexPending = load.status === "loading" || load.remote !== remote;
  const detailPending = fullPage && params.has("record") && params.get("source") === "canonical" && (remoteStatus === "loading" || indexPending);
  if (fullPage && params.has("record") && detail && !detailPending) {
    const back = () => {
      const previous = new URL(document.referrer || window.location.origin);
      if (window.history.length > 1 && previous.origin === window.location.origin && previous.pathname === "/owner-center/records") window.history.back();
      else window.location.href = recordSearchUrl(null, query);
    };
    const sections = [{ title: "Recorded facts", children: <DetailList items={detail.facts} /> }];
    if (detail.source === "canonical") sections.push({ title: "Attachments", children: <AttachmentPanel authorized identityKey={session.identityKey} domain={detail.collection} recordId={detail.id} localDevelopment={session.localDevelopment} /> });
    return <RecordDetailPage title={detail.title} eyebrow={detail.type} identity={`Record ${detail.id}`} status={detail.facts.find((fact) => fact.label === "Status")?.value || "Saved record"} onBack={back} sections={sections} related={<a href={recordSearchUrl(null, query)}>Return to record search</a>} />;
  }
  return <section className="record-search" aria-label="Private record search">
    {fullPage ? <PageHeader title="Record search" description="Find saved records by name, stable ID, type or status." /> : <h3>Private records</h3>}
    {fullPage ? <form action="/owner-center/records" method="get"><SearchField label="Search saved records" name="recordQ" value={draft} onChange={setDraft} placeholder="Name, ID, type or status" />{params.get("betaLocalMode") === "true" ? <input type="hidden" name="betaLocalMode" value="true" /> : null}{["light", "dark"].includes(params.get("themeInspect")) ? <input type="hidden" name="themeInspect" value={params.get("themeInspect")} /> : null}<PrimaryButton type="submit">Search records</PrimaryButton></form> : null}
    {indexPending ? <p role="status">Loading saved records…</p> : load.status === "error" ? <p role="alert">Saved records could not be read. <button type="button" onClick={() => setRefresh((value) => value + 1)}>Retry</button></p> : <>
      {detailPending ? <p role="status">Loading this record from the canonical server…</p> : params.has("record") && fullPage ? <p role="alert">This exact record is unavailable. It may have been archived, removed, or be in a server source that has not been loaded.</p> : null}
      {query.trim().length < 2 ? <p>Enter at least two characters.</p> : <p role="status">{results.total ? `${results.total} matching records` : "No matching records in the loaded sources."}{results.truncated ? " Showing the first 100; narrow your search." : ""}</p>}
      {load.index.warnings.length || load.index.duplicates.length ? <p role="status">Some sources or ambiguous record IDs are unavailable. Search results are incomplete.</p> : null}
      {results.groups.map((group) => <section key={group.key} className="record-search__group"><h4>{group.title}</h4><ul>{group.records.map((record) => <li key={record.id}><a href={recordSearchUrl(record, query)}><strong>{record.title}</strong><span>{record.id}</span></a></li>)}</ul></section>)}
    </>}
    {fullPage ? <div className="record-search__server"><StatusBadge tone="neutral">{load.status !== "ready" ? "Local index unavailable" : load.index.warnings.length || load.index.duplicates.length ? "Local results incomplete" : "Local index ready"}</StatusBadge><button type="button" onClick={() => setRemoteStatus("loading")} disabled={remoteStatus === "loading"}>{remoteStatus === "loading" ? "Checking server…" : "Include canonical server records"}</button><p role="status">{remoteStatus && remoteStatus !== "loading" ? remoteStatus : "Server records are queried only when requested."}</p></div> : <a href={recordSearchUrl(null, query)}>Open full record search</a>}
  </section>;
}
