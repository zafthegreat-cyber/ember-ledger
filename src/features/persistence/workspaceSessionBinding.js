import { BACKUP_SOURCE_REGISTRY, BACKUP_STORAGE_TYPES } from "../backup/backupSourceRegistry.js";
import { canonicalStringify, hashCanonicalJson, parseUntrustedJsonValue } from "../backup/canonicalJson.js";
import { workspaceFail } from "./cloudWorkspaceSources.js";

export const SESSION_DRAFT_OWNER_KEY = "code3.session-draft-owner.v1";
export const SESSION_DRAFT_SWITCH_KEY = "code3.session-draft-switch.v1";
const ARCHIVE_PREFIX = "code3.session-draft-archive.v1:";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sources = BACKUP_SOURCE_REGISTRY.filter((source) => source.storageType === BACKUP_STORAGE_TYPES.SESSION_STORAGE && source.containsOwnerData && !source.containsSecurityOrSessionState);
const allowedKey = (key) => sources.some((source) => source.storageKeys?.includes(key) || source.storagePrefixes?.some((prefix) => key.startsWith(prefix)));
const assertOwner = (owner) => { if (owner !== null && !UUID.test(owner || "")) workspaceFail("ACCOUNT_REQUIRED", "A verified account is required before opening draft records."); };
function read(storage,key) { const raw=storage.getItem(key); if(raw!==null && typeof raw!=="string") workspaceFail("DRAFT_STORAGE_UNAVAILABLE","This tab’s drafts could not be read safely."); return raw; }
function write(storage,key,raw) {
  try { if(raw===null)storage.removeItem(key); else storage.setItem(key,raw); } catch { /* Verify throw-after-write adapters too. */ }
  if(read(storage,key)!==raw)workspaceFail("DRAFT_STORAGE_UNAVAILABLE","Draft records could not be preserved. The account switch has stopped.");
}
function capture(storage) {
  const result={};
  for(let index=0;index<storage.length;index++) { const key=storage.key(index); if(typeof key==="string" && allowedKey(key))result[key]=read(storage,key); }
  return result;
}
function apply(storage,raws) {
  for(const key of Object.keys(capture(storage)))if(!Object.hasOwn(raws,key))write(storage,key,null);
  for(const [key,raw] of Object.entries(raws))write(storage,key,raw);
}
function validateRaws(raws) {
  if(!raws || Array.isArray(raws) || typeof raws!=="object" || Object.entries(raws).some(([key,value])=>!allowedKey(key)||typeof value!=="string"))workspaceFail("DRAFT_ARCHIVE_INVALID","This tab’s saved drafts need review. Current drafts have not been changed.");
}
export function readSessionDraftBinding(storage) {
  const raw=read(storage,SESSION_DRAFT_OWNER_KEY);
  if(raw===null)return null;
  const value=parseUntrustedJsonValue(raw);
  if(value?.version!==1 || !UUID.test(value.ownerId||"") || Object.keys(value).some(key=>!["version","ownerId"].includes(key)))workspaceFail("DRAFT_OWNER_INVALID","This tab’s draft account marker needs review.");
  return value;
}
export const hasSessionDrafts=(storage)=>Object.keys(capture(storage)).length>0;
export const hasPendingSessionDraftSwitch=(storage)=>read(storage,SESSION_DRAFT_SWITCH_KEY)!==null;
async function archive(ownerId,raws) {
  const body={format:"code3-session-draft-archive",version:1,ownerId,raws};
  return canonicalStringify({...body,hash:await hashCanonicalJson(body)});
}
async function readArchive(storage,ownerId) {
  const raw=read(storage,`${ARCHIVE_PREFIX}${ownerId}`);
  if(raw===null)return {raw:null,raws:{}};
  const value=parseUntrustedJsonValue(raw,{maxBytes:24*1024*1024,maxStringLength:12*1024*1024});
  const {hash,...body}=value;
  if(body.format!=="code3-session-draft-archive"||body.version!==1||body.ownerId!==ownerId||Object.keys(body).some(key=>!["format","version","ownerId","raws"].includes(key))||await hashCanonicalJson(body)!==hash)workspaceFail("DRAFT_ARCHIVE_INVALID","The saved drafts could not be verified. Current drafts are unchanged.");
  validateRaws(body.raws);
  return {raw,raws:body.raws};
}

/** Run before mounting any draft readers/writers. This tab's auth/invite keys are never read or changed. */
export async function switchSessionDraftOwner({storage=globalThis.sessionStorage,ownerId,confirmed=false,assertCurrent=()=>{}}={}) {
  assertOwner(ownerId); assertCurrent();
  if(hasPendingSessionDraftSwitch(storage))workspaceFail("DRAFT_RECOVERY_REQUIRED","Recover this tab’s interrupted draft switch first.");
  const previous=readSessionDraftBinding(storage);
  if(previous?.ownerId===ownerId)return {status:"UNCHANGED"};
  const beforeMarker=read(storage,SESSION_DRAFT_OWNER_KEY);
  const before=capture(storage);
  if(!previous && Object.keys(before).length && !confirmed)workspaceFail("DRAFT_CONFIRMATION_REQUIRED","Confirm which account owns this tab’s existing drafts before opening them.");
  if(!previous && ownerId===null)return {status:"UNBOUND"};
  const target=ownerId===null?{raw:null,raws:{}}:await readArchive(storage,ownerId);
  if(!previous&&Object.keys(before).length&&target.raw!==null&&canonicalStringify(before)!==canonicalStringify(target.raws))workspaceFail("DRAFT_ARCHIVE_CONFLICT","Both unclaimed drafts and this account’s saved drafts exist. Keep both copies for review before switching.");
  const next=!previous && confirmed && Object.keys(before).length ? before : target.raws;
  const preserveOwner=previous?.ownerId||(Object.keys(before).length?ownerId:null);
  const preserved=preserveOwner?await archive(preserveOwner,before):null;
  assertCurrent();
  if(read(storage,SESSION_DRAFT_OWNER_KEY)!==beforeMarker||canonicalStringify(capture(storage))!==canonicalStringify(before)
    ||(ownerId!==null&&read(storage,`${ARCHIVE_PREFIX}${ownerId}`)!==target.raw))workspaceFail("STALE_DRAFTS","Drafts changed during the account switch. Please try again.");
  // Persist the exact-byte original before removing or replacing any draft key.
  if(preserveOwner)write(storage,`${ARCHIVE_PREFIX}${preserveOwner}`,preserved);
  const journal={version:1,from:previous?.ownerId||null,to:ownerId,beforeMarker,before,next,status:"PREPARED"};
  write(storage,SESSION_DRAFT_SWITCH_KEY,canonicalStringify(journal));
  try {
    apply(storage,next);
    write(storage,SESSION_DRAFT_OWNER_KEY,ownerId===null?null:canonicalStringify({version:1,ownerId}));
    write(storage,SESSION_DRAFT_SWITCH_KEY,canonicalStringify({...journal,status:"COMMITTED"}));
  } catch(error) {
    try { apply(storage,before); write(storage,SESSION_DRAFT_OWNER_KEY,beforeMarker); write(storage,SESSION_DRAFT_SWITCH_KEY,null); }
    catch { workspaceFail("DRAFT_RECOVERY_REQUIRED","Draft switching stopped with a preserved copy. Reopen the app to recover it."); }
    throw error;
  }
  write(storage,SESSION_DRAFT_SWITCH_KEY,null);
  return {status:ownerId===null?"SUSPENDED":"SWITCHED"};
}

export function recoverSessionDraftSwitch({storage=globalThis.sessionStorage,assertCurrent=()=>{}}={}) {
  assertCurrent();
  const raw=read(storage,SESSION_DRAFT_SWITCH_KEY);
  if(raw===null)return {status:"NO_RECOVERY"};
  const journal=parseUntrustedJsonValue(raw,{maxBytes:24*1024*1024,maxStringLength:12*1024*1024});
  assertOwner(journal.from); assertOwner(journal.to); validateRaws(journal.before); validateRaws(journal.next);
  if(journal.version!==1||!["PREPARED","COMMITTED"].includes(journal.status)||Object.keys(journal).some(key=>!["version","from","to","beforeMarker","before","next","status"].includes(key)))workspaceFail("DRAFT_RECOVERY_REQUIRED","This tab’s draft checkpoint needs review.");
  const expectedMarker=journal.from===null?null:canonicalStringify({version:1,ownerId:journal.from});
  const nextMarker=journal.to===null?null:canonicalStringify({version:1,ownerId:journal.to});
  if(journal.beforeMarker!==expectedMarker||![expectedMarker,nextMarker].includes(read(storage,SESSION_DRAFT_OWNER_KEY)))workspaceFail("DRAFT_RECOVERY_REQUIRED","Draft account ownership changed after recovery began.");
  const current=capture(storage);
  for(const key of new Set([...Object.keys(current),...Object.keys(journal.before),...Object.keys(journal.next)])) {
    if(current[key]!==journal.before[key]&&current[key]!==journal.next[key])workspaceFail("DRAFT_RECOVERY_REQUIRED","Drafts changed after the checkpoint. Both copies have been retained.");
  }
  assertCurrent();
  if(journal.status==="PREPARED") {apply(storage,journal.before);write(storage,SESSION_DRAFT_OWNER_KEY,journal.beforeMarker);}
  else if(canonicalStringify(current)!==canonicalStringify(journal.next)||read(storage,SESSION_DRAFT_OWNER_KEY)!==nextMarker)workspaceFail("DRAFT_RECOVERY_REQUIRED","Completed drafts no longer match their checkpoint.");
  write(storage,SESSION_DRAFT_SWITCH_KEY,null);
  return {status:journal.status==="PREPARED"?"ROLLED_BACK":"RECOVERED_COMMIT"};
}
