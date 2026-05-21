export function workspaceDeleteBlockReason(workspace = {}, counts = {}, options = {}) {
  if (!workspace?.id) return "Choose a workspace first.";
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
  if (settings.lockToEmberTide) {
    return activeForgeWorkspace
      ? `Forge is locked to ${activeForgeWorkspace.name || "Ember & Tide"}.`
      : "Forge is locked to Ember & Tide, but that workspace is unavailable.";
  }
  if (settings.personalForgeEnabled === false) {
    return "Personal Forge is hidden. Forge uses your default or business workspace.";
  }
  return "Personal Forge is visible. Forge can follow your current workspace.";
}

export function sellerModeEnabled(userType = "", dashboardPreset = "") {
  return String(userType || "").toLowerCase() === "seller" || String(dashboardPreset || "").toLowerCase() === "seller";
}
