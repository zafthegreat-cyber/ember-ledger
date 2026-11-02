/** A server decision is tied to the exact account and bearer session that requested it. */
export function hasServerAppAccessDecision(profile, userId = profile?.userId || profile?.id) {
  return Boolean(userId && profile?.serverAppAccessCheckedFor === userId);
}

export async function withVerifiedAppAccess(profile, user, client) {
  const result = { ...profile, serverAppAccess: false, serverAppAccessCheckedFor: "" };
  if (!user?.id || (profile?.userId || profile?.id) !== user.id || !client?.auth || !client.rpc) return result;
  try {
    const before = await client.auth.getSession();
    const session = before.data?.session;
    if (before.error || session?.user?.id !== user.id || !session.access_token) return result;
    const identity = await client.auth.getUser(session.access_token);
    if (identity.error || identity.data?.user?.id !== user.id || identity.data.user.is_anonymous) return result;
    const request = client.rpc("has_full_app_access");
    if (typeof request.setHeader !== "function") return result;
    const checked = await request.setHeader("Authorization", `Bearer ${session.access_token}`);
    const after = await client.auth.getSession();
    if (checked.error || typeof checked.data !== "boolean" || after.error
      || after.data?.session?.access_token !== session.access_token || after.data?.session?.user?.id !== user.id) return result;
    return { ...result, serverAppAccess: checked.data, serverAppAccessCheckedFor: user.id };
  } catch { return result; }
}
