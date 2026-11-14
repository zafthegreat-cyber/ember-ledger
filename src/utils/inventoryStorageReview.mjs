export function reviewedStorageState(current, changes, now = new Date().toISOString()) {
  const byId=new Map();
  for(const change of changes){
    const original=current.inventory.find(row=>String(row.id)===String(change.id));
    if(!original||original.provenanceManaged===true)throw new Error('A selected purchase is unavailable for this storage change. Reopen the review.');
    if(String(original.storageLocation||'')!==String(change.previousStorageLocation||''))throw new Error('A storage location changed while you reviewed it. Reopen the review before saving.');
    const storage=String(change.storageLocation||'').trim();
    if(!storage||storage.length>200)throw new Error('Enter a storage location of 1–200 characters.');
    if(byId.has(String(original.id)))throw new Error('A purchase was selected more than once. Reopen the review.');
    byId.set(String(original.id),{...original,storageLocation:storage,updatedAt:now});
  }
  return {...current,inventory:current.inventory.map(row=>byId.get(String(row.id))||row)};
}
