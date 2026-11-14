// Set and game artwork (audit 2026-11-14).
//
// The app no longer ships official game logos or Pokémon set logos: they are
// third-party trademarks we have no licence for (AGENTS.md "IP / assets"), and
// they were the most likely cause of a store takedown. Every caller already has
// a text fallback (game short name, set code + name), so these resolvers return
// null. If licensed artwork is ever obtained, restore a reviewed registry here
// and keep the attribution with it.

export function resolveSetArtwork() {
  return null;
}

export function resolveGameArtwork() {
  return null;
}
