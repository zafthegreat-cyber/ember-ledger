import assert from "node:assert/strict";
import {
  forgeIdentityModeDescription,
  forgeIdentityModeFromSettings,
  forgeIdentityModeLabel,
  forgeModePatchFromIdentityDraft,
  isProtectedWorkspace,
  normalizeForgeIdentityMode,
  validateWorkspaceIdentityDraft,
  workspaceIdentityDraftFromState,
  workspaceVisibleInNormalSelection,
} from "../src/utils/settingsWorkspaceSafety.js";
import { normalizeQuickAddDestinations } from "../src/utils/quickAddRouting.js";
import { buildYearEndTaxSummary } from "../src/utils/businessTaxRecords.js";

const personalWorkspace = { id: "workspace-personal-local-beta", name: "My Personal Space", type: "personal" };
const businessWorkspace = { id: "workspace-business", name: "Dillon Sales", type: "business" };
const emberWorkspace = { id: "workspace-ember-tide", name: "Ember & Tide", type: "business" };

assert.equal(normalizeForgeIdentityMode("Personal Forge"), "personal");
assert.equal(normalizeForgeIdentityMode("seller"), "business");
assert.equal(normalizeForgeIdentityMode("Ember and Tide"), "ember_tide");
assert.equal(forgeIdentityModeLabel("business"), "Business Forge");
assert.match(forgeIdentityModeDescription("ember_tide"), /Ember & Tide branding/i);

assert.equal(forgeIdentityModeFromSettings({ lockToEmberTide: true }, emberWorkspace), "ember_tide");
assert.equal(forgeIdentityModeFromSettings({ defaultForgeWorkspaceId: businessWorkspace.id }, businessWorkspace), "business");
assert.equal(forgeIdentityModeFromSettings({ personalForgeEnabled: true }, personalWorkspace), "personal");

const businessDraft = workspaceIdentityDraftFromState(
  { ...businessWorkspace, businessName: "Tide Cards", displayLabel: "Tide Table", notes: "Year-end workspace" },
  { defaultForgeWorkspaceId: businessWorkspace.id, personalForgeEnabled: false },
  { activeForgeWorkspace: businessWorkspace }
);
assert.equal(businessDraft.workspaceName, "Dillon Sales");
assert.equal(businessDraft.businessName, "Tide Cards");
assert.equal(businessDraft.displayLabel, "Tide Table");
assert.equal(businessDraft.keepPersonalForgeSeparate, false);
assert.equal(businessDraft.forgeIdentityMode, "business");

assert.equal(validateWorkspaceIdentityDraft({ ...businessDraft, workspaceName: "" }), "Workspace name cannot be blank.");
assert.equal(validateWorkspaceIdentityDraft({ ...businessDraft, workspaceName: "A".repeat(51) }, { maxNameLength: 50 }), "Workspace name must be 50 characters or fewer.");
assert.equal(validateWorkspaceIdentityDraft({ ...businessDraft, forgeIdentityMode: "ember_tide" }, { emberTideAvailable: false }), "Ember & Tide Forge is not available for this account yet.");
assert.equal(validateWorkspaceIdentityDraft(businessDraft, { maxNameLength: 50, emberTideAvailable: true }), "");

assert.deepEqual(
  forgeModePatchFromIdentityDraft({ ...businessDraft, forgeIdentityMode: "business", keepPersonalForgeSeparate: false }, {
    personalWorkspaceId: personalWorkspace.id,
    businessWorkspaceId: businessWorkspace.id,
    emberTideWorkspaceId: emberWorkspace.id,
  }),
  {
    forgeIdentityMode: "business",
    useEmberTideBranding: false,
    keepPersonalForgeSeparate: false,
    personalForgeEnabled: false,
    businessName: "Tide Cards",
    shopName: "",
    publicDisplayName: "Tide Table",
    lockToEmberTide: false,
    defaultForgeWorkspaceId: businessWorkspace.id,
  }
);

const emberPatch = forgeModePatchFromIdentityDraft({ ...businessDraft, forgeIdentityMode: "ember_tide", useEmberTideBranding: true }, {
  personalWorkspaceId: personalWorkspace.id,
  businessWorkspaceId: businessWorkspace.id,
  emberTideWorkspaceId: emberWorkspace.id,
});
assert.equal(emberPatch.lockToEmberTide, true);
assert.equal(emberPatch.defaultForgeWorkspaceId, emberWorkspace.id);
assert.equal(emberPatch.useEmberTideBranding, true);

assert.equal(isProtectedWorkspace(personalWorkspace, { defaultWorkspaceId: personalWorkspace.id }), true);
assert.equal(isProtectedWorkspace(emberWorkspace, { defaultWorkspaceId: personalWorkspace.id }), true);
assert.equal(isProtectedWorkspace({ id: "workspace-system", name: "System", type: "system" }, { defaultWorkspaceId: personalWorkspace.id }), true);
assert.equal(isProtectedWorkspace(businessWorkspace, { defaultWorkspaceId: personalWorkspace.id }), false);

assert.equal(workspaceVisibleInNormalSelection({ ...businessWorkspace, archivedAt: "" }), true);
assert.equal(workspaceVisibleInNormalSelection({ ...businessWorkspace, archivedAt: "2026-01-01T00:00:00.000Z" }), false);
assert.equal(workspaceVisibleInNormalSelection({ ...businessWorkspace, active: false }), false);
assert.equal(workspaceVisibleInNormalSelection({ ...businessWorkspace, archivedAt: "2026-01-01T00:00:00.000Z" }, { isAdmin: true, includeArchivedForAdmin: true }), true);

assert.deepEqual(normalizeQuickAddDestinations({ forge: true, vault: true }), {
  vault: true,
  wishlist: false,
  forge: true,
  tidetradr: false,
});

const taxSummary = buildYearEndTaxSummary({
  expenses: [{ id: "expense-1", amount: 12, category: "shipping", workspaceId: businessWorkspace.id, date: "2026-01-10" }],
  mileageTrips: [{ id: "trip-1", miles: 18, vehicleName: "Toyota Prius", workspaceId: businessWorkspace.id, date: "2026-02-01", purpose: "shipping/drop-off" }],
  inventoryItems: [{ id: "item-1", name: "ETB", quantity: 1, unitCost: 55, workspaceId: businessWorkspace.id, createdAt: "2026-01-12" }],
  sales: [],
  year: "2026",
});
assert.equal(taxSummary.expenses.total, 12);
assert.equal(taxSummary.mileage.totalMiles, 18);
assert.equal(taxSummary.inventory.costBasis, 55);

console.log("Workspace identity tests passed.");
