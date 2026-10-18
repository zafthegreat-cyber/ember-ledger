import { useId, useRef, useState } from "react";
import { EmptyState, PrimaryButton, RecordCard, SecondaryButton, SectionHeader, StatusBadge } from "../../components/operations/OperationsUI.jsx";
import { getBotProviderDiscovery } from "./providerDiscovery.js";

const PRIORITY_PROVIDERS = ["POLAR", "SNIPED", "SWOOPER"];
const providerKey = (provider) => provider.providerKey || provider.key;
const words = (value) => String(value || "Unknown").replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
const emptyDraft = () => ({ friendlyName: "", runtimeLabel: "", version: "" });

function reviewedLabel(value) {
  const date = new Date(String(value || "").length === 10 ? `${value}T12:00:00` : value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(date) : "Not yet reviewed";
}

function ProviderGuidance({ provider }) {
  const setup = provider.setup || {};
  const discovery = getBotProviderDiscovery(providerKey(provider));
  const officialUrl = /^https:\/\//.test(setup.officialUrl || "") ? setup.officialUrl : "";
  return (
    <div className="bot-setup-guidance" data-testid="bot-provider-guidance">
      <div className="bot-ops-card-heading">
        <div><p className="ops-eyebrow">Selected bot</p><h3>{provider.displayName}</h3></div>
        <span data-testid="bot-provider-connection"><StatusBadge tone="neutral">Not connected</StatusBadge></span>
      </div>
      <p>{setup.summary || "Keep a local record of this bot while its integration options are reviewed."}</p>
      <dl className="bot-setup-steps">
        <div><dt>Available in Code 3 TCG</dt><dd>{setup.availableNow || "Save an installation name, device label, and version on this device."}</dd></div>
        <div><dt>Next step for connection</dt><dd>{setup.nextStep || "A documented provider interface and its access requirements need to be verified first."}</dd></div>
      </dl>
      <div className="bot-setup-source">
        {officialUrl ? <a href={officialUrl} target="_blank" rel="noopener noreferrer">Official {provider.displayName} guide / website <span aria-hidden="true">↗</span><span className="sr-only"> (opens a new tab)</span></a> : null}
        <span>Reviewed {reviewedLabel(setup.reviewedAt)}</span>
      </div>
      <details className="bot-setup-evidence">
        <summary>Connection details</summary>
        <p>Documentation describes the provider. It does not connect this app or grant access.</p>
        {discovery ? <dl className="bot-ops-facts">
          <div><dt>Official API</dt><dd>{words(discovery.officialApiStatus)}</dd></div>
          <div><dt>Webhook documentation</dt><dd>{words(discovery.webhookStatus)}</dd></div>
          <div><dt>Export documentation</dt><dd>{words(discovery.exportStatus)}</dd></div>
          <div><dt>Provider network</dt><dd>Disabled</dd></div>
        </dl> : <p>No verified interface is configured for this provider.</p>}
        <p>Live status, task control, and checkout are unavailable in Code 3 TCG.</p>
      </details>
    </div>
  );
}

function saveErrorMessage(error) {
  if (/CREDENTIAL|SECRET|AUTHORITY|RAW_PROVIDER/.test(error?.code || "")) return "Use a simple label or version only. Passwords, license keys, payment details, and connection secrets do not belong here.";
  if (/VERSION|CONFLICT/.test(error?.code || "")) return "This installation changed since you opened it. Reload the page to review the latest record before editing again.";
  return error?.message || "The installation could not be saved. Try again.";
}

export default function BotProviderSetup({ providers, installations, onSave, onTrack }) {
  const id = useId();
  const nameRef = useRef(null);
  const savingRef = useRef(false);
  const [selectedKey, setSelectedKey] = useState(() => PRIORITY_PROVIDERS.find((key) => providers.some((provider) => providerKey(provider) === key)) || providerKey(providers[0] || {}));
  const [draft, setDraft] = useState(emptyDraft);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const selected = providers.find((provider) => providerKey(provider) === selectedKey) || providers[0];
  const priority = providers.filter((provider) => PRIORITY_PROVIDERS.includes(providerKey(provider)));
  const other = providers.filter((provider) => !PRIORITY_PROVIDERS.includes(providerKey(provider)));

  function selectProvider(key) {
    setSelectedKey(key);
    setDraft(emptyDraft());
    setError("");
    setMessage("");
  }

  function editInstallation(row) {
    setSelectedKey(row.provider);
    setDraft({ friendlyName: row.friendlyName || "", runtimeLabel: row.runtimeLabel || "", version: row.version || "" });
    setEditing(row);
    setError("");
    setMessage("");
    nameRef.current?.focus();
  }

  function cancelEditing() {
    setEditing(null);
    setDraft(emptyDraft());
    setError("");
    setMessage("");
    nameRef.current?.focus();
  }

  async function saveInstallation(event) {
    event.preventDefault();
    if (savingRef.current || !selected) return;
    if (!draft.friendlyName.trim()) {
      setError("Give this installation a name so you can recognize it later.");
      nameRef.current?.focus();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await onSave({
        provider: providerKey(selected),
        friendlyName: draft.friendlyName.trim(),
        runtimeLabel: draft.runtimeLabel.trim(),
        version: draft.version.trim(),
      }, editing);
      setEditing(saved);
      setDraft({ friendlyName: saved.friendlyName, runtimeLabel: saved.runtimeLabel || "", version: saved.version || "" });
      setMessage("Installation saved on this device. The bot is not connected and no tasks have been started.");
    } catch (saveError) {
      if (saveError?.savedRecord) {
        setEditing(saveError.savedRecord);
        setDraft({ friendlyName: saveError.savedRecord.friendlyName, runtimeLabel: saveError.savedRecord.runtimeLabel || "", version: saveError.savedRecord.version || "" });
      }
      setError(saveErrorMessage(saveError));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (!selected) return <EmptyState title="No bot providers available">Provider information could not be loaded.</EmptyState>;

  return (
    <section className="bot-setup" data-testid="bot-provider-setup">
      <SectionHeader eyebrow="Your bots" title="Set up your bot list" description="Choose a bot to see its connection options and save where you use it. You do not need an API key to add a local record." />
      <RecordCard className="bot-setup-card">
        <div className="bot-setup-selector">
          <div className="bot-setup-field bot-setup-provider-field"><label htmlFor={`${id}-provider`}>Bot provider</label>
            <select id={`${id}-provider`} aria-describedby={`${id}-provider-help`} value={providerKey(selected)} onChange={(event) => selectProvider(event.target.value)} disabled={saving || Boolean(editing)}>
              {[...priority, ...other].map((provider) => <option key={providerKey(provider)} value={providerKey(provider)}>{provider.displayName}</option>)}
            </select>
            <small id={`${id}-provider-help`}>{editing ? "The provider stays fixed for an existing installation. Cancel editing to add another bot." : `All ${providers.length} providers have their own setup guidance.`}</small>
          </div>
          <span className="bot-setup-local-label">Local setup · Owner only</span>
        </div>
        <div className="bot-setup-columns">
          <ProviderGuidance provider={selected} />
          <form className="bot-setup-form" aria-label={editing ? "Edit bot installation" : "Add bot installation"} onSubmit={saveInstallation} aria-busy={saving}>
            <div><h3>{editing ? "Edit installation" : "Add an installation"}</h3><p>A name and optional device/version details. No credentials or access are requested.</p></div>
            <label className="bot-setup-field" htmlFor={`${id}-name`}><span>Installation name</span><input ref={nameRef} id={`${id}-name`} name="friendlyName" value={draft.friendlyName} onChange={(event) => setDraft((current) => ({ ...current, friendlyName: event.target.value }))} placeholder={`${selected.displayName} on my computer`} required maxLength={200} autoComplete="off" disabled={saving} /></label>
            <label className="bot-setup-field" htmlFor={`${id}-device`}><span>Device label (optional)</span><input id={`${id}-device`} name="runtimeLabel" value={draft.runtimeLabel} onChange={(event) => setDraft((current) => ({ ...current, runtimeLabel: event.target.value }))} placeholder="Home computer" maxLength={200} autoComplete="off" disabled={saving} /></label>
            <label className="bot-setup-field" htmlFor={`${id}-version`}><span>Bot version (optional)</span><input id={`${id}-version`} name="version" value={draft.version} onChange={(event) => setDraft((current) => ({ ...current, version: event.target.value }))} placeholder="Shown in the bot’s Settings" maxLength={100} autoComplete="off" disabled={saving} /></label>
            <p className="bot-setup-save-note">Saved in this browser on this device. Adding a record does not install or connect the bot.</p>
            <div className="bot-setup-feedback" aria-live="polite">{message ? <p role="status">{message}</p> : null}</div>
            {error ? <p className="bot-setup-error" role="alert">{error}</p> : null}
            <div className="bot-setup-actions"><PrimaryButton type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Save installation"}</PrimaryButton>{editing ? <SecondaryButton onClick={cancelEditing} disabled={saving}>Cancel editing</SecondaryButton> : null}</div>
          </form>
        </div>
      </RecordCard>
      <section className="bot-setup-installations" aria-label="Saved installations">
        <SectionHeader title="Your installations" description="These are saved labels, not live connection status." />
        {installations.length ? <div className="bot-setup-installation-list">{installations.map((row) => <RecordCard key={row.id} className="bot-setup-installation" data-testid={`bot-installation-${row.id}`}>
          <div className="bot-setup-installation-heading"><div><p className="ops-eyebrow">{providers.find((provider) => providerKey(provider) === row.provider)?.displayName || words(row.provider)}</p><h3>{row.friendlyName}</h3></div><StatusBadge tone="neutral">Not connected</StatusBadge></div>
          <dl className="bot-setup-installation-facts"><div><dt>Device</dt><dd>{row.runtimeLabel || "Not added"}</dd></div><div><dt>Version</dt><dd>{row.version || "Not added"}</dd></div></dl>
          <div className="bot-setup-actions"><SecondaryButton aria-label={`Edit ${row.friendlyName}`} onClick={() => editInstallation(row)} disabled={saving}>Edit</SecondaryButton>{onTrack ? <SecondaryButton onClick={() => onTrack({ installationId: row.id })} disabled={saving} aria-label={`View tasks for ${row.friendlyName}`}>View tasks</SecondaryButton> : null}</div>
        </RecordCard>)}</div> : <EmptyState title="Add your first bot">Choose a provider above and give the installation a name. Your collection, prices, and existing records stay as they are.</EmptyState>}
      </section>
    </section>
  );
}
