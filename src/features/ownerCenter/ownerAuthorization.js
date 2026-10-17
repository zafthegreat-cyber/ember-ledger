export function canAccessOwnerCenter({
  guestPreview = false,
  session = null,
} = {}) {
  if (guestPreview) return false;
  return Boolean(session?.authenticated === true && session?.ownerAuthorized === true);
}
