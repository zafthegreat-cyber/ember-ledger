const text = value => String(value ?? "").trim();
export function collectionCopyDetails(item = {}) {
  const identity = [item.variant || item.printing || item.finish, item.language || item.cardLanguage,
    item.conditionName || item.condition || item.sealedCondition,
    [item.gradingCompany || item.grading_company, item.grade || item.gradeValue].filter(Boolean).join(" ")].map(text).filter(Boolean).join(" · ");
  const storage = text(item.storageLocation || item.storage_location || item.physicalLocation || item.physical_location || item.locationSummary || item.location);
  const notes = text(item.collectorNotes || item.notes || item.conditionNotes || item.storageCareNotes);
  return { identity, storage, notes };
}
