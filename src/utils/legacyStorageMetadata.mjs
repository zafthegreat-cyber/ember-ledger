const PREFIX='[CODE3_STORAGE_V1]';
export function readLegacyStorageLocation(notes='') {
  const line=String(notes).split(/\r?\n/).find(row=>row.startsWith(PREFIX));
  if(!line)return undefined;
  try {const value=JSON.parse(line.slice(PREFIX.length));return typeof value.location==='string'&&value.location.length<=160?value.location:undefined;}catch{return undefined;}
}
export function writeLegacyStorageLocation(notes='',location='') {
  if(typeof location!=='string'||location.length>160)throw new Error('Storage names must be at most 160 characters.');
  const original=String(notes).split(/\r?\n/).filter(line=>!line.startsWith(PREFIX)).join('\n').replace(/\n+$/,'');
  return [original,`${PREFIX}${JSON.stringify({location})}`].filter(Boolean).join('\n');
}
