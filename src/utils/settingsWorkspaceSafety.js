export const FORGE_IDENTITY_MODE_OPTIONS = [
  {
    value: "personal",
    label: "Personal Forge",
    description: "Track your own collection/sales privately.",
  },
  {
    value: "business",
    label: "Business Forge",
    description: "Track business inventory, expenses, mileage, and sales prep.",
  },
  {
    value: "ember_tide",
    label: "Ember & Tide Forge",
    description: "Use Ember & Tide branding for your shop/workspace.",
  },
];

export function normalizeForgeIdentityMode(value = "personal") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["personal", "personal_forge"].includes(normalized)) return "personal";
  if (["business", "seller", "business_forge"].includes(normalized)) return "business";
  if (["ember_tide", "ember_and_tide", "emberandtide", "official", "brand"].includes(normalized)) return "ember_tide";
  return "personal";
}

export function forgeIdentityModeLabel(mode = "personal") {
  const normalized = normalizeForgeIdentityMode(mode);
  return FORGE_IDENTITY_MODE_OPTIONS.find((option) => option.value === normalized)?.label || "Personal Forge";
}

export function forgeIdentityModeDescription(mode = "personal") {
  const normalized = normalizeForgeIdentityMode(mode);
  return FORGE_IDENTITY_MODE_OPTIONS.find((option) => option.value === normalized)?.description || FORGE_IDENTITY_MODE_OPTIONS[0].description;
}

export function forgeIdentityModeFromSettings(settings = {}, activeForgeWorkspace = null) {
  if (settings.lockToEmberTide || settings.useEmberTideBranding || settings.alwaysUseEmberTideForge || settings.lockForgeToEmberTide) {
    return "ember_tide";
  }
  if (settings.forgeIdentityMode) return normalizeForgeIdentityMode(settings.forgeIdentityMode);
  const type = String(activeForgeWorkspace?.type || activeForgeWorkspace?.workspaceType || "").toLowerCase();
  const name = String(activeForgeWorkspace?.name || "").toLowerCase();
  if (type === "personal" || /personal|my personal/.test(name)) return "personal";
  if (activeForgeWorkspace?.id || settings.defaultForgeWorkspaceId || settings.defaultForgeWorkspace) return "business";
  return settings.personalForgeEnabled === false ? "business" : "personal";
}

export function normalizeWorkspaceIdentityText(value = "", maxLength = 80) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

export function workspaceIdentityDraftFromState(workspace = {}, settings = {}, options = {}) {
  const activeMode = forgeIdentityModeFromSettings(settings, options.activeForgeWorkspace || workspace);
  const useEmberTideBranding = Boolean(
    settings.useEmberTideBranding ||
    settings.lockToEmberTide ||
    activeMode === "ember_tide" ||
    workspace.useEmberTideBranding ||
    workspace.use_ember_tide_branding
  );
  return {
    workspaceId: workspace.id || "",
    workspaceName: workspace.name || "",
    businessName: workspace.businessName || workspace.business_name || settings.businessName || "",
    shopName: workspace.shopName || workspace.shop_name || settings.shopName || "",
    displayLabel: workspace.displayLabel || workspace.display_label || settings.publicDisplayName || "",
    notes: workspace.notes || workspace.workspaceNotes || workspace.workspace_notes || "",
    defaultForgeMode: normalizeForgeIdentityMode(workspace.defaultForgeMode || workspace.default_forge_mode || activeMode),
    forgeIdentityMode: activeMode,
    useEmberTideBranding,
    keepPersonalForgeSeparate: settings.keepPersonalForgeSeparate !== undefined
      ? Boolean(settings.keepPersonalForgeSeparate)
      : settings.personalForgeEnabled !== false,
    active: workspace.active !== false && workspace.status !== "archived" && !workspace.archivedAt && !workspace.archived_at,
  };
}

export function validateWorkspaceIdentityDraft(draft = {}, options = {}) {
  const maxNameLength = Number(options.maxNameLength || 50);
  const workspaceName = normalizeWorkspaceIdentityText(draft.workspaceName, maxNameLength);
  if (!workspaceName) return "Workspace name cannot be blank.";
  if (String(draft.workspaceName || "").trim().replace(/\s+/g, " ").length > maxNameLength) {
    return `Workspace name must be ${maxNameLength} characters or fewer.`;
  }
  const businessName = normalizeWorkspaceIdentityText(draft.businessName, 80);
  if (String(draft.businessName || "").trim().length > 80) return "Business/shop name must be 80 characters or fewer.";
  if (String(draft.shopName || "").trim().length > 80) return "Shop name must be 80 characters or fewer.";
  if (normalizeForgeIdentityMode(draft.forgeIdentityMode) === "ember_tide" && options.emberTideAvailable === false) {
    return "Ember & Tide Forge is not available for this account yet.";
  }
  if (!businessName && normalizeForgeIdentityMode(draft.forgeIdentityMode) === "business") {
    return "";
  }
  return "";
}

export function forgeModePatchFromIdentityDraft(draft = {}, options = {}) {
  const mode = normalizeForgeIdentityMode(draft.useEmberTideBranding ? "ember_tide" : draft.forgeIdentityMode);
  const personalWorkspaceId = options.personalWorkspaceId || "";
  const emberTideWorkspaceId = options.emberTideWorkspaceId || "";
  const businessWorkspaceId = options.businessWorkspaceId || draft.workspaceId || "";
  const keepPersonalForgeSeparate = draft.keepPersonalForgeSeparate !== false;
  const basePatch = {
    forgeIdentityMode: mode,
    useEmberTideBranding: mode === "ember_tide",
    keepPersonalForgeSeparate,
    personalForgeEnabled: keepPersonalForgeSeparate || mode === "personal",
    businessName: normalizeWorkspaceIdentityText(draft.businessName, 80),
    shopName: normalizeWorkspaceIdentityText(draft.shopName, 80),
    publicDisplayName: normalizeWorkspaceIdentityText(draft.displayLabel, 80),
  };
  if (mode === "ember_tide") {
    return {
      ...basePatch,
      lockToEmberTide: true,
      defaultForgeWorkspaceId: emberTideWorkspaceId || businessWorkspaceId || "",
    };
  }
  if (mode === "business") {
    return {
      ...basePatch,
      lockToEmberTide: false,
      defaultForgeWorkspaceId: businessWorkspaceId || "",
    };
  }
  return {
    ...basePatch,
    lockToEmberTide: false,
    defaultForgeWorkspaceId: personalWorkspaceId || "",
    personalForgeEnabled: true,
    keepPersonalForgeSeparate: true,
  };
}

export function isProtectedWorkspace(workspace = {}, options = {}) {
  if (!workspace?.id) return true;
  const id = String(workspace.id || "").toLowerCase();
  const type = String(workspace.type || workspace.workspaceType || "").toLowerCase();
  const name = String(workspace.name || "").toLowerCase();
  if (id === String(options.defaultWorkspaceId || "").toLowerCase()) return true;
  if (workspace.systemWorkspace || workspace.system_workspace || workspace.isSystem || workspace.is_system || workspace.protected || workspace.locked) return true;
  if (["system", "admin", "internal"].includes(type)) return true;
  if (/^workspace-(system|admin|internal)/.test(id)) return true;
  if (id.includes("ember-tide") && options.allowEmberTideWorkspaceDelete !== true) return true;
  if (/\bember\s*(?:&|and)\s*tide\b/.test(name) && options.allowEmberTideWorkspaceDelete !== true) return true;
  return false;
}

export function workspaceVisibleInNormalSelection(workspace = {}, options = {}) {
  if (!workspace?.id) return false;
  const archived = Boolean(workspace.archivedAt || workspace.archived_at) ||
    workspace.active === false ||
    String(workspace.status || "").toLowerCase() === "archived";
  if (!archived) return true;
  return Boolean(options.isAdmin && options.includeArchivedForAdmin);
}

export function workspaceDeleteBlockReason(workspace = {}, counts = {}, options = {}) {
  if (!workspace?.id) return "Choose a workspace first.";
  if (isProtectedWorkspace(workspace, options)) {
    return workspace.id === options.defaultWorkspaceId
      ? "The default personal workspace cannot be deleted. Hide Personal Forge or archive other workspaces instead."
      : "Protected system or Ember & Tide workspaces cannot be deleted by normal users.";
  }
  if (workspace.id === options.defaultWorkspaceId) {
    return "The default personal workspace cannot be deleted. Hide Personal Forge or archive other workspaces instead.";
  }
  if (!options.canManage) return "You need owner or admin access to delete this workspace.";
  if (Number(counts.total || 0) > 0) {
    return "Permanent delete is blocked because this workspace still has records. Archive it instead.";
  }
  if (String(workspace.id) === String(options.activeWorkspaceId) && Number(options.activeWorkspaceCount || 0) <= 1) {
    return "Create or switch to another active workspace before deleting the current workspace.";
  }
  if (!options.confirmed) return "Type DELETE to permanently delete this empty workspace.";
  return "";
}

export function forgeModeSummary(settings = {}, activeForgeWorkspace = null) {
  const identityMode = forgeIdentityModeFromSettings(settings, activeForgeWorkspace);
  if (identityMode === "ember_tide" && settings.useEmberTideBranding && !settings.lockToEmberTide) {
    return "Forge uses Ember & Tide branding where available.";
  }
  if (settings.lockToEmberTide) {
    return activeForgeWorkspace
      ? `Forge is locked to ${activeForgeWorkspace.name || "Ember & Tide"}.`
      : "Forge is locked to Ember & Tide, but that workspace is unavailable.";
  }
  if (settings.personalForgeEnabled === false) {
    return "Personal Forge is hidden. Forge uses your default or business workspace.";
  }
  if (identityMode === "business") {
    return activeForgeWorkspace
      ? `Forge is using ${activeForgeWorkspace.name || "your business workspace"}.`
      : "Business Forge is selected, but no Forge workspace is available.";
  }
  return "Personal Forge is visible. Forge can follow your current workspace.";
}

export function sellerModeEnabled(userType = "", dashboardPreset = "") {
  return String(userType || "").toLowerCase() === "seller" || String(dashboardPreset || "").toLowerCase() === "seller";
}
