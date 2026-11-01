// Highlight literal text without using search aliases: query expansion can
// change string lengths ("&" -> "and") and corrupt offsets in the visible title.
function foldWithOffsets(value) {
  let folded = "";
  const offsets = [];
  let offset = 0;
  for (const character of value) {
    const normalized = character.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    for (const part of normalized) {
      folded += part;
      for (let index = 0; index < part.length; index += 1) offsets.push({ start: offset, end: offset + character.length });
    }
    offset += character.length;
  }
  return { folded, offsets };
}

export function getCatalogHighlightParts(label, query) {
  const text = String(label || "");
  const needle = foldWithOffsets(String(query || "").trim()).folded;
  if (needle.length < 2) return null;
  const { folded, offsets } = foldWithOffsets(text);
  const index = folded.indexOf(needle);
  if (index < 0) return null;
  const start = offsets[index].start;
  let end = offsets[index + needle.length - 1].end;
  // Include separately encoded combining accents with their preceding letter.
  while (end < text.length && /\p{M}/u.test(String.fromCodePoint(text.codePointAt(end)))) end += String.fromCodePoint(text.codePointAt(end)).length;
  return { before: text.slice(0, start), match: text.slice(start, end), after: text.slice(end) };
}
