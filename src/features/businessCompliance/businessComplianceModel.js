export const BUSINESS_COMPLIANCE_STORAGE_KEY = "code3.business-compliance.v1";
export const BUSINESS_COMPLIANCE_VERSION = 1;

export const SETUP_STATUSES = Object.freeze([
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "complete", label: "Complete" },
  { value: "not_applicable", label: "Not applicable" },
]);

export const DEADLINE_CADENCES = Object.freeze([
  { value: "one_time", label: "One time" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
]);

export const DEADLINE_CATEGORIES = Object.freeze([
  "Entity",
  "Sales tax",
  "Income tax",
  "License",
  "Insurance",
  "Bookkeeping",
  "Other",
]);

export const DOCUMENT_TYPES = Object.freeze([
  "Formation",
  "Tax",
  "License",
  "Insurance",
  "Banking",
  "Contract",
  "Receipt archive",
  "Other",
]);

function safeId(prefix) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function todayIso(date = new Date()) {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, "0");
  const day = String(local.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nextFixedDate(month, day, now = new Date()) {
  const candidate = new Date(now.getFullYear(), month - 1, day);
  if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    candidate.setFullYear(candidate.getFullYear() + 1);
  }
  return todayIso(candidate);
}

export function createInitialBusinessComplianceState(now = new Date()) {
  return {
    version: BUSINESS_COMPLIANCE_VERSION,
    updatedAt: now.toISOString(),
    profile: {
      legalName: "",
      dba: "",
      entityType: "LLC",
      state: "Virginia",
      locality: "",
      formationDate: "",
      stateEntityReference: "",
      einLastFour: "",
      salesTaxFrequency: "",
      bookkeepingMethod: "",
      notes: "",
    },
    setup: [
      { id: "setup-entity", title: "Virginia business registration", category: "Entity", status: "not_started", agency: "Virginia SCC", reference: "", completedDate: "", notes: "Save the formation approval and entity reference." },
      { id: "setup-operating-agreement", title: "Operating agreement", category: "Entity", status: "not_started", agency: "Internal", reference: "", completedDate: "", notes: "Keep the signed current copy with company records." },
      { id: "setup-ein", title: "Federal EIN", category: "Tax", status: "not_started", agency: "IRS", reference: "", completedDate: "", notes: "Record only a safe confirmation reference or EIN last four here, not the full EIN." },
      { id: "setup-bank", title: "Business bank account", category: "Banking", status: "not_started", agency: "Bank", reference: "", completedDate: "", notes: "Use an account nickname or last four only. Do not store full account numbers." },
      { id: "setup-sales-tax", title: "Virginia sales tax registration", category: "Sales tax", status: "not_started", agency: "Virginia Tax", reference: "", completedDate: "", notes: "Record filing frequency after Virginia assigns it." },
      { id: "setup-resale", title: "ST-10 resale certificate ready", category: "Sales tax", status: "not_started", agency: "Virginia Tax", reference: "", completedDate: "", notes: "Keep the current certificate available for qualifying resale purchases." },
      { id: "setup-local-license", title: "Local zoning and business license", category: "License", status: "not_started", agency: "Locality", reference: "", completedDate: "", notes: "Confirm the requirements for the actual business location." },
      { id: "setup-bookkeeping", title: "Bookkeeping and receipt system", category: "Bookkeeping", status: "not_started", agency: "Internal", reference: "", completedDate: "", notes: "Keep business funds, inventory cost, expenses, receipts, and mileage organized from day one." },
      { id: "setup-insurance", title: "Business insurance review", category: "Insurance", status: "not_started", agency: "Insurer", reference: "", completedDate: "", notes: "Review general liability, inventory/property, event/transit, and cyber needs as applicable." },
      { id: "setup-marketplaces", title: "Marketplace and direct-sales tax settings reviewed", category: "Sales tax", status: "not_started", agency: "Internal", reference: "", completedDate: "", notes: "Keep marketplace-facilitated sales separate from direct taxable sales in bookkeeping." },
    ],
    deadlines: [
      { id: "deadline-sales-tax", title: "Virginia sales tax return", category: "Sales tax", agency: "Virginia Tax", dueDate: "", cadence: "monthly", status: "active", lastCompletedDate: "", notes: "Set the first due date and change cadence if Virginia assigns quarterly filing. File zero returns when required." },
      { id: "deadline-scc", title: "Virginia SCC annual registration fee", category: "Entity", agency: "Virginia SCC", dueDate: "", cadence: "annual", status: "active", lastCompletedDate: "", notes: "Set the due date after the LLC formation month is known." },
      { id: "deadline-local-license", title: "Local business license renewal", category: "License", agency: "Locality", dueDate: nextFixedDate(3, 1, now), cadence: "annual", status: "active", lastCompletedDate: "", notes: "Starter date matches Suffolk's March 1 renewal timing; confirm or change it if the business locality differs." },
      { id: "deadline-property", title: "Business personal property return review", category: "License", agency: "Locality", dueDate: nextFixedDate(5, 1, now), cadence: "annual", status: "active", lastCompletedDate: "", notes: "Starter date matches Suffolk's May 1 filing timing; confirm applicability and locality." },
      { id: "deadline-estimated-tax", title: "Estimated income tax review", category: "Income tax", agency: "IRS / Virginia Tax", dueDate: "", cadence: "quarterly", status: "active", lastCompletedDate: "", notes: "Set dates after confirming whether estimated payments apply to the owners' tax situation." },
      { id: "deadline-insurance", title: "Insurance renewal", category: "Insurance", agency: "Insurer", dueDate: "", cadence: "annual", status: "active", lastCompletedDate: "", notes: "Add the policy renewal date once coverage is active." },
    ],
    documents: [],
  };
}

function ensureArray(value, fallback) {
  return Array.isArray(value) ? value : fallback;
}

export function normalizeBusinessComplianceState(value, now = new Date()) {
  const fallback = createInitialBusinessComplianceState(now);
  if (!value || typeof value !== "object") return fallback;
  return {
    ...fallback,
    ...value,
    version: BUSINESS_COMPLIANCE_VERSION,
    profile: { ...fallback.profile, ...(value.profile || {}) },
    setup: ensureArray(value.setup, fallback.setup),
    deadlines: ensureArray(value.deadlines, fallback.deadlines),
    documents: ensureArray(value.documents, fallback.documents),
  };
}

export function deadlineHealth(deadline, now = new Date()) {
  if (deadline.status === "complete") return { key: "complete", label: "Complete", days: null };
  if (!deadline.dueDate) return { key: "needs_date", label: "Needs date", days: null };
  const due = new Date(`${deadline.dueDate}T12:00:00`);
  if (Number.isNaN(due.getTime())) return { key: "needs_date", label: "Needs date", days: null };
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const days = Math.ceil((due - base) / 86400000);
  if (days < 0) return { key: "overdue", label: `${Math.abs(days)}d overdue`, days };
  if (days === 0) return { key: "due_today", label: "Due today", days };
  if (days <= 30) return { key: "due_soon", label: `Due in ${days}d`, days };
  return { key: "upcoming", label: `Due in ${days}d`, days };
}

export function advanceDueDate(dueDate, cadence) {
  if (!dueDate || cadence === "one_time") return "";
  const date = new Date(`${dueDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  if (cadence === "monthly") date.setMonth(date.getMonth() + 1);
  if (cadence === "quarterly") date.setMonth(date.getMonth() + 3);
  if (cadence === "annual") date.setFullYear(date.getFullYear() + 1);
  return todayIso(date);
}

export function completeDeadline(deadline, now = new Date()) {
  const completedDate = todayIso(now);
  if (deadline.cadence === "one_time") {
    return { ...deadline, status: "complete", lastCompletedDate: completedDate };
  }
  return {
    ...deadline,
    status: "active",
    lastCompletedDate: completedDate,
    dueDate: advanceDueDate(deadline.dueDate, deadline.cadence),
  };
}

export function summarizeBusinessCompliance(state, now = new Date()) {
  const actionableSetup = state.setup.filter((item) => item.status !== "not_applicable");
  const setupComplete = actionableSetup.filter((item) => item.status === "complete").length;
  const deadlineStates = state.deadlines.map((deadline) => ({ deadline, health: deadlineHealth(deadline, now) }));
  return {
    setupComplete,
    setupTotal: actionableSetup.length,
    overdue: deadlineStates.filter((row) => row.health.key === "overdue").length,
    dueSoon: deadlineStates.filter((row) => ["due_today", "due_soon"].includes(row.health.key)).length,
    needsDate: deadlineStates.filter((row) => row.health.key === "needs_date").length,
    documents: state.documents.length,
  };
}

export function sortDeadlines(deadlines, now = new Date()) {
  const rank = { overdue: 0, due_today: 1, due_soon: 2, upcoming: 3, needs_date: 4, complete: 5 };
  return [...deadlines].sort((a, b) => {
    const aHealth = deadlineHealth(a, now);
    const bHealth = deadlineHealth(b, now);
    if (rank[aHealth.key] !== rank[bHealth.key]) return rank[aHealth.key] - rank[bHealth.key];
    return String(a.dueDate || "9999-12-31").localeCompare(String(b.dueDate || "9999-12-31"));
  });
}

export function newSetupItem(seed = {}) {
  return {
    id: safeId("setup"),
    title: "",
    category: "Other",
    status: "not_started",
    agency: "",
    reference: "",
    completedDate: "",
    notes: "",
    ...seed,
  };
}

export function newDeadline(seed = {}) {
  return {
    id: safeId("deadline"),
    title: "",
    category: "Other",
    agency: "",
    dueDate: "",
    cadence: "one_time",
    status: "active",
    lastCompletedDate: "",
    notes: "",
    ...seed,
  };
}

export function newDocument(seed = {}) {
  return {
    id: safeId("document"),
    title: "",
    type: "Other",
    location: "",
    expirationDate: "",
    notes: "",
    addedAt: new Date().toISOString(),
    ...seed,
  };
}
