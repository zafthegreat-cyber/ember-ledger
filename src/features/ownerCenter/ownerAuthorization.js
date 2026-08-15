import { isOwner } from "../../utils/rolePermissions.js";

export function canAccessOwnerCenter({
  guestPreview = false,
  localMode = false,
  user = null,
  currentUserProfile = {},
  subscriptionProfile = {},
} = {}) {
  if (guestPreview) return false;
  if (localMode && user?.id === "local-beta") return true;
  return isOwner(currentUserProfile) || isOwner(subscriptionProfile);
}
