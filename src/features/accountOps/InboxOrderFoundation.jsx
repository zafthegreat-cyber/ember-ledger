import { useEffect, useState } from "react";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PrimaryButton,
  QuietButton,
  SectionHeader,
  StatusBadge,
} from "../../components/operations/OperationsUI.jsx";
import {
  AccountOpsProviderApiError,
  fetchAccountOpsProviderConnections,
} from "../../services/accountOpsProviderApi.js";

const EMPTY_RUNTIME = Object.freeze({
  status: "idle",
  configurationState: "UNAVAILABLE",
  trustedRuntime: Object.freeze({
    hostedRuntimeVerified: false,
    managedStorageVerified: false,
    environment: "UNKNOWN",
    productionEnvironment: false,
  }),
  providers: Object.freeze([]),
  connections: Object.freeze([]),
  warnings: Object.freeze([]),
  errorCode: "",
});

function words(value) {
  return String(value || "Unknown").replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function dateLabel(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not reported";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusTone(value) {
  if (value === "HEALTHY") return "success";
  if (value === "ERROR" || value === "REVOKED") return "danger";
  if (value === "CONNECTING" || value === "NEEDS_REAUTH") return "warning";
  return "neutral";
}

function ProviderConnections({ localDevelopment }) {
  const [attempt, setAttempt] = useState(0);
  const [runtime, setRuntime] = useState(EMPTY_RUNTIME);
  const [request, setRequest] = useState({ attempt, localDevelopment });
  if (request.attempt !== attempt || request.localDevelopment !== localDevelopment) {
    setRequest({ attempt, localDevelopment });
    setRuntime((current) => ({ ...current, status: "loading", errorCode: "" }));
  }

  useEffect(() => {
    const controller = new AbortController();
    fetchAccountOpsProviderConnections({
      localDevelopment,
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted) return;
      setRuntime({ status: "ready", errorCode: "", ...result });
    }).catch((error) => {
      if (controller.signal.aborted) return;
      setRuntime({
        ...EMPTY_RUNTIME,
        status: "error",
        errorCode: error instanceof AccountOpsProviderApiError ? error.code : "RUNTIME_UNAVAILABLE",
      });
    });
    return () => controller.abort();
  }, [attempt, localDevelopment]);

  if (runtime.status === "loading" || runtime.status === "idle") {
    return <LoadingState title="Checking provider foundation">Contacting the protected Code 3 runtime. No mailbox content is being requested.</LoadingState>;
  }

  if (runtime.status === "error") {
    const accessTitle = runtime.errorCode === "SIGN_IN_REQUIRED"
      ? "Sign In Required"
      : runtime.errorCode === "OWNER_ACCESS_REQUIRED"
        ? "Owner Access Required"
        : "Provider runtime unavailable";
    const accessMessage = runtime.errorCode === "SIGN_IN_REQUIRED"
      ? "The application session must be verified again before provider connections can be viewed."
      : runtime.errorCode === "OWNER_ACCESS_REQUIRED"
        ? "This signed-in account is not authorized to manage private provider connections."
        : "Code 3 could not reach a trusted provider runtime. It will not fall back to browser credential storage.";
    return <ErrorState title={accessTitle} action={<QuietButton onClick={() => setAttempt((value) => value + 1)}>Retry</QuietButton>}>{accessMessage}</ErrorState>;
  }

  const trustedRuntimeAvailable = runtime.trustedRuntime.hostedRuntimeVerified
    && runtime.trustedRuntime.environment === "PREVIEW"
    && runtime.trustedRuntime.productionEnvironment === false;
  const providerRows = runtime.providers.length
    ? runtime.providers
    : Object.freeze([
      { providerId: "gmail", displayName: "Gmail", configurationStatus: "NOT_CONFIGURED" },
      { providerId: "microsoft-outlook", displayName: "Outlook / Microsoft", configurationStatus: "NOT_CONFIGURED" },
    ]);

  const statusSummary = (
    <article className="account-ops-provider-card account-ops-runtime-card" aria-label="Trusted runtime and provider status">
      <header>
        <div>
          <h3>Trusted runtime</h3>
          <p>{trustedRuntimeAvailable ? "Verified server-side in Vercel Preview" : "Preview server execution has not been verified"}</p>
        </div>
        <StatusBadge tone={trustedRuntimeAvailable ? "success" : "warning"}>
          {trustedRuntimeAvailable ? "Available" : "Unavailable"}
        </StatusBadge>
      </header>
      <dl className="account-ops-provider-facts">
        <div>
          <dt>Provider security storage</dt>
          <dd>{runtime.trustedRuntime.managedStorageVerified ? "Verified" : "Unavailable"}</dd>
        </div>
        {providerRows.map((provider) => (
          <div key={provider.providerId}>
            <dt>{provider.displayName}</dt>
            <dd>{words(provider.configurationStatus)}</dd>
          </div>
        ))}
      </dl>
      <p className="account-ops-provider-boundary">
        Runtime availability does not authorize a mailbox. Gmail and Outlook remain disconnected with live capabilities disabled.
      </p>
    </article>
  );

  if (runtime.configurationState !== "AVAILABLE") {
    return (
      <div className="account-ops-provider-list">
        {statusSummary}
        <EmptyState title="No mailbox connected">
          Provider authorization is not configured. No provider credentials or mailbox content are stored in this browser.
        </EmptyState>
      </div>
    );
  }

  if (!runtime.connections.length) {
    return (
      <div className="account-ops-provider-list">
        {statusSummary}
        <EmptyState title="No mailbox connected">
          The protected provider foundation is available, but no mailbox has been authorized. Live connection controls are not enabled in this phase.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="account-ops-provider-list" aria-label="Mailbox provider connections">
      {statusSummary}
      {runtime.connections.map((connection) => (
        <article className="account-ops-provider-card" key={connection.connectionId}>
          <header>
            <div>
              <h3>{words(connection.provider)}</h3>
              <p>{connection.accountLabel || "Connected account label unavailable"}</p>
            </div>
            <StatusBadge tone={statusTone(connection.status)}>{words(connection.status)}</StatusBadge>
          </header>
          <dl className="account-ops-provider-facts">
            <div><dt>Last healthy</dt><dd>{dateLabel(connection.lastHealthyAt)}</dd></div>
            <div><dt>Connected</dt><dd>{dateLabel(connection.connectedAt)}</dd></div>
          </dl>
          {connection.grantedScopes.length ? (
            <details className="account-ops-provider-details">
              <summary>Granted permission summary</summary>
              <ul>{connection.grantedScopes.map((scope) => <li key={scope}>{scope}</li>)}</ul>
            </details>
          ) : null}
        </article>
      ))}
      {runtime.warnings.length ? (
        <div className="account-ops-provider-warnings" role="status">
          <strong>Provider warnings</strong>
          <ul>{runtime.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}

function PurchaseImportLink({ onOpenPurchases }) {
  return onOpenPurchases
    ? <PrimaryButton onClick={onOpenPurchases}>Open purchase email import</PrimaryButton>
    : <a className="ops-button ops-button--primary" href="/business/purchases">Open purchase email import</a>;
}

function PurchaseImportCard({ onOpenPurchases }) {
  return <article className="account-ops-import-card">
    <div><span className="account-ops-section-kicker">PURCHASE EMAILS</span><h3>Turn a receipt into a purchase draft</h3><p>Open Purchases to make a one-time, read-only pull from AOL, Gmail, or Yahoo with an app password. Review the retailer, items, and totals before saving a draft.</p></div>
    <PurchaseImportLink onOpenPurchases={onOpenPurchases} />
    <p className="account-ops-import-note">The app password is not saved. Importing does not place an order, receive inventory, or keep a mailbox connection running.</p>
  </article>;
}

function ConnectionsSection({ localDevelopment, onOpenPurchases }) {
  return (
    <section className="account-ops-section" aria-label="Provider Connections">
      <SectionHeader
        title="Provider Connections"
        description="Saved OAuth connection metadata. The separate one-time purchase-email tool is available in Purchases."
        actions={<StatusBadge tone="warning">Foundation Only</StatusBadge>}
      />
      <p className="account-ops-provider-boundary">
        Saved OAuth connections require the owner-protected Preview runtime and managed security storage. These connection controls are not enabled. OAuth credentials and mailbox content never belong in Account Ops local storage.
      </p>
      <PurchaseImportCard onOpenPurchases={onOpenPurchases} />
      <ProviderConnections localDevelopment={localDevelopment} />
    </section>
  );
}

function InboxSection({ onOpenPurchases }) {
  return (
    <section className="account-ops-section" aria-label="Inbox foundation">
      <SectionHeader
        title="Inbox"
        description="Review purchase receipts in Purchases; keep verification and account follow-ups in Account Ops."
        actions={<StatusBadge tone="neutral">No background inbox</StatusBadge>}
      />
      <p className="account-ops-provider-boundary">
        This Account Ops view does not read a mailbox. Protected messages, security codes, reset links, and unrelated personal email are not retained here.
      </p>
      <PurchaseImportCard onOpenPurchases={onOpenPurchases} />
      <p className="account-ops-empty-line">No sample messages are shown as real data. One-time receipt previews stay in Purchases until you review them.</p>
    </section>
  );
}

function OrdersSection({ onOpenPurchases }) {
  return (
    <section className="account-ops-section" aria-label="Order Candidate foundation">
      <SectionHeader
        title="Order Candidates"
        description="Start from an email receipt, review the details, and save a purchase draft in Purchases."
        actions={<StatusBadge tone="neutral">Review Required</StatusBadge>}
      />
      <p className="account-ops-provider-boundary">
        An Order Candidate is evidence, not a Business Purchase. This Account Ops view cannot create purchases, receive inventory, or change business records.
      </p>
      <PurchaseImportCard onOpenPurchases={onOpenPurchases} />
      <details className="account-ops-provider-details">
        <summary>How receipt review works</summary>
        <ol>
          <li>Request a one-time receipt preview in Purchases with your mailbox app password.</li>
          <li>Review the proposed retailer, order, items, and amounts. Correct anything missing.</li>
          <li>Save a purchase draft explicitly. Receiving and inventory remain separate steps.</li>
        </ol>
      </details>
    </section>
  );
}

export default function InboxOrderFoundation({ section, localDevelopment = false, onOpenPurchases }) {
  if (section === "connections") return <ConnectionsSection localDevelopment={localDevelopment} onOpenPurchases={onOpenPurchases} />;
  if (section === "inbox") return <InboxSection onOpenPurchases={onOpenPurchases} />;
  if (section === "orders") return <OrdersSection onOpenPurchases={onOpenPurchases} />;
  return null;
}
