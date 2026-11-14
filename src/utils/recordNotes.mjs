import { readImportSavedDetails } from './importReviewSafety.mjs';

// Display only. Split only the exact suffix emitted by our own importer and
// only when its source metadata agrees. Original notes remain byte-for-byte.
export function recordNotePresentation(record = {}) {
  const imported = readImportSavedDetails(record.actionNotes || record.action_notes || '');
  const raw = String(record.notes ?? imported.notes ?? '');
  const source = String(record.importSourceType || imported.importSourceType || '');
  if (!source) {
    const catalogNote = 'Imported from public TCGCSV product and price data. Restock and availability are not implied.';
    if ([record.sourceType, record.source, record.catalogSource].some(value => String(value || '').toLowerCase() === 'tcgcsv')) {
      if (raw === catalogNote) return { notes: '', source: 'TCGCSV catalog', original: catalogNote };
      if (raw.endsWith(` | ${catalogNote}`)) return { notes: raw.slice(0, -(catalogNote.length + 3)), source: 'TCGCSV catalog', original: catalogNote };
    }
    return { notes: raw, source: '', original: '' };
  }
  const marker = `Imported from ${source}. Original: `;
  const start = raw.lastIndexOf(marker);
  if (start < 0 || (start > 0 && raw.slice(start - 3, start) !== ' | ')) return { notes: raw, source, original: '' };
  return { notes: start ? raw.slice(0, start - 3) : '', source, original: raw.slice(start + marker.length) };
}
