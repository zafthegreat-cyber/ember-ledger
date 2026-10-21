import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { sha256Text, ebayIdentityHash } from "../src/features/ebayPrivacy/identityHash.js";
import { EBAY_PRIVACY_POLICY_KEY, readEbayPrivacyPolicy, writeEbayPrivacyPolicy, redactEbayPersonalData, refreshEbayPrivacyPolicy, deriveEbayListingTombstones } from "../src/features/ebayPrivacy/privacyPolicy.js";
import { redactEbayArchive, redactedPayloadLocation } from "../src/features/ebayPrivacy/privacyArchives.js";
import { redactEbayDeviceCopies } from "../src/features/ebayPrivacy/devicePrivacy.js";
import { canonicalStringify, hashCanonicalJson } from "../src/features/backup/canonicalJson.js";
import { normalizeFlipScoutState, serializeFlipScoutState } from "../src/features/flipScout/storageRepository.js";
import { createVerifiedBackup } from "../src/features/backup/backupFormat.js";
import { captureWorkspaceSources } from "../src/features/persistence/cloudWorkspaceSources.js";
import { planWorkspaceRestore } from "../src/features/backup/workspaceRestorePlan.js";
import { recoverWorkspaceSources } from "../src/features/backup/workspaceRecovery.js";
import { recordsToCsv } from "../src/features/flipScout/csv.js";
const deletedSeller = "Synthetic-Deleted-Seller";
const policy = { version:1, after:3, tombstones:[{kind:"username",hash:ebayIdentityHash("username",deletedSeller)}] };
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem:(key) => values.get(key) ?? null, setItem:(key,value) => values.set(key,String(value)), removeItem:(key) => values.delete(key), key:(index) => [...values.keys()][index] ?? null, get length(){return values.size;} };
}
const row = (overrides = {}) => ({ id:"owner-record-1", providerId:"ebay", sellerName:deletedSeller, externalListingId:"v1|12345|0", title:"Owner saved product", description:"Provider description", listingUrl:"https://www.ebay.com/itm/12345", imageReferences:["https://i.ebayimg.com/synthetic"], location:"Synthetic location", askingPrice:60, currentBid:45, priceCurrency:"USD", marketValue:80.12, purchasePrice:40.27, acquisitionCostMinorUnits:4027, quantity:2, ownerNotes:"Keep this owner note", ...overrides });
const seal = async (value,field="hash") => ({...value,[field]:await hashCanonicalJson(value)});

test("synchronous digests match Node SHA-256 over padding boundaries and Unicode", () => {
  for (const value of ["","abc","漢字 🔥","a".repeat(55),"a".repeat(56),"a".repeat(64),"a".repeat(129)]) assert.equal(sha256Text(value),createHash("sha256").update(value).digest("hex"));
  assert.equal(ebayIdentityHash("username",deletedSeller),createHash("sha256").update(`username\u001f${deletedSeller}`).digest("hex"));
  assert.notEqual(ebayIdentityHash("username",deletedSeller),ebayIdentityHash("userId",deletedSeller));
});
test("exact known-eBay match erases only provider details, retains all owner records and current money", () => {
  const original = row(); const next = redactEbayPersonalData(original,policy);
  for (const field of ["id","title","askingPrice","currentBid","priceCurrency","marketValue","purchasePrice","acquisitionCostMinorUnits","quantity","ownerNotes"]) assert.deepEqual(next[field],original[field]);
  for (const field of ["sellerName","externalListingId","description","listingUrl","imageReferences","location"]) assert.equal(Object.hasOwn(next,field),false);
  assert.equal(next.ebayPrivacyRedacted,true); assert.equal(original.sellerName,deletedSeller);
  assert.equal(redactEbayPersonalData(next,policy),next);
});
test("case/whitespace/substrings/manual records and unrelated sellers remain byte-identical", () => {
  for (const value of [row({sellerName:deletedSeller.toLowerCase()}),row({sellerName:` ${deletedSeller}`}),row({sellerName:`${deletedSeller}-other`}),row({providerId:"manual",marketplace:"Local"}),row({sellerName:"Unrelated"})]) assert.equal(redactEbayPersonalData(value,policy),value);
});
test("nested seller user ID, EIAS token, and identity-only listing restore are matched", () => {
  for (const [kind,field] of [["userId","userId"],["eiasToken","eiasToken"]]) {
    const p = {version:1,after:1,tombstones:[{kind,hash:ebayIdentityHash(kind,"Synthetic exact ID")}]};
    assert.equal(redactEbayPersonalData(row({sellerName:"Other",seller:{[field]:"Synthetic exact ID"}}),p).seller,undefined);
  }
  const derived = deriveEbayListingTombstones({providerListings:[row()]},policy);
  assert.equal(derived.tombstones.length,2);
  assert.equal(redactEbayPersonalData(row({sellerName:""}),derived).listingUrl,undefined);
});
test("provider analysis observations/URLs/images removed while owner analysis input and valuations survive", () => {
  const evidence = {providerId:"ebay",sourceId:"ebay:12345",externalIdentity:{externalListingId:"v1|12345|0",listingUrl:"https://www.ebay.com/itm/12345"},observations:[{observationType:"SELLER_NAME",value:deletedSeller},{observationType:"LOCATION",value:"Private"},{observationType:"BID_COUNT",value:3}]};
  const value = {id:"analysis-1",inputHash:"f".repeat(64),sourceInput:{identity:{name:"Owner identified card"},sourceEvidence:[evidence],sourceReference:"https://www.ebay.com/itm/12345",images:[{reference:"owner-photo",provenance:{kind:"OWNER_SUPPLIED"}},{reference:"provider-photo",provenance:{providerId:"ebay",sourceId:"ebay:12345"}}],valuationEvidence:[{sourceId:"owner-assumption",amount:{minorUnits:8000,currency:"USD"}}]}};
  const next = redactEbayPersonalData(value,policy);
  assert.equal(next.sourceInput.sourceEvidence[0].observations.length,1);
  assert.equal(next.sourceInput.sourceEvidence[0].observations[0].observationType,"BID_COUNT");
  assert.deepEqual(next.sourceInput.identity,value.sourceInput.identity); assert.deepEqual(next.sourceInput.valuationEvidence,value.sourceInput.valuationEvidence);
  assert.deepEqual(next.sourceInput.images,[value.sourceInput.images[0]]);
  assert.equal(next.sourceInput.sourceReference,undefined); assert.equal(next.inputHash,value.inputHash); assert.equal(next.privacyRequiresReanalysis,true);
});
test("mixed-source appraisals redact seller A while unrelated seller B identity, images, observations and prices stay exact", () => {
  const first={...row(),sourceId:"ebay:deleted-listing"};
  const unrelated={...row({sellerName:"UnrelatedSeller",externalListingId:"v1|98765|0",listingUrl:"https://www.ebay.com/itm/98765"}),sourceId:"ebay:unrelated-listing"};
  const value={id:"appraisal-owner-id",inputHash:"f".repeat(64),sourceInput:{sourceReference:unrelated.listingUrl,sourceEvidence:[first,unrelated],images:[{reference:"first-photo",provenance:{providerId:"ebay",sourceId:first.sourceId}},{reference:"second-photo",provenance:{providerId:"ebay",sourceId:unrelated.sourceId}}],valuationEvidence:[{sourceId:unrelated.sourceId,provenance:{providerId:"ebay"},amount:{minorUnits:9876,currency:"USD"}}]}};
  const derived=deriveEbayListingTombstones(value,policy);
  assert.equal(derived.tombstones.some((entry)=>entry.hash===ebayIdentityHash("listingId",unrelated.externalListingId)),false);
  const next=redactEbayPersonalData(value,derived);
  assert.deepEqual(next.sourceInput.sourceEvidence[1],unrelated);
  assert.deepEqual(next.sourceInput.images,[value.sourceInput.images[1]]);
  assert.deepEqual(next.sourceInput.valuationEvidence,value.sourceInput.valuationEvidence);
  assert.equal(next.sourceInput.sourceReference,unrelated.listingUrl);
  assert.equal(next.sourceInput.sourceEvidence[0].sellerName,undefined);
  assert.equal(next.sourceInput.sourceEvidence[0].purchasePrice,40.27);
});
test("older offline observation-only identities and sourceId listing references obey server tombstones", () => {
  for (const [kind,type] of [["userId","SELLER_USER_ID"],["eiasToken","SELLER_EIAS_TOKEN"]]) {
    const p={version:1,after:1,tombstones:[{kind,hash:ebayIdentityHash(kind,"exact-old-identity")}]};
    const entry={providerId:"ebay",externalIdentity:{externalListingId:"v1|old|0",listingUrl:"https://www.ebay.com/itm/old"},observations:[{observationType:type,value:"exact-old-identity"}],askingPrice:18.52};
    const derived=deriveEbayListingTombstones(entry,p);
    const next=redactEbayPersonalData(entry,derived);
    assert.equal(next.externalIdentity.listingUrl,undefined); assert.deepEqual(next.observations,[]); assert.equal(next.askingPrice,18.52);
  }
  const p={version:1,after:1,tombstones:[{kind:"listingId",hash:ebayIdentityHash("listingId","v1|source-only|0")}]};
  for(const key of ["sourceId","underlyingSourceId"]) {
    const next=redactEbayPersonalData({providerId:"ebay",[key]:"ebay:v1|source-only|0",listingUrl:"https://www.ebay.com/itm/source-only",askingPrice:55.01},p);
    assert.equal(next.listingUrl,undefined); assert.equal(next[key],"ebay-privacy-redacted"); assert.equal(next.askingPrice,55.01);
    const nested=redactEbayPersonalData({provenance:{providerId:"ebay",[key]:"ebay:v1|source-only|0"},listingUrl:"https://www.ebay.com/itm/source-only",askingPrice:55.01},p);
    assert.equal(nested.listingUrl,undefined); assert.equal(nested.provenance[key],"ebay-privacy-redacted"); assert.equal(nested.askingPrice,55.01);
  }
});
test("shared unidentified-provider source labels cannot tombstone or redact a different seller", () => {
  const first={providerId:"ebay",sourceId:"ebay:unidentified:listing",sellerName:deletedSeller,askingPrice:42};
  const second={providerId:"ebay",sourceId:"ebay:unidentified:listing",sellerName:"Other unidentified seller",askingPrice:82};
  const value={sourceEvidence:[first,second]}; const derived=deriveEbayListingTombstones(value,policy);
  assert.equal(derived.tombstones.length,1); assert.deepEqual(redactEbayPersonalData(value,derived).sourceEvidence[1],second);
});
test("policy storage contains only typed hashes, corruption blocks silently unsafe exports", () => {
  const s = storage(); writeEbayPrivacyPolicy(policy,s);
  assert.equal(s.getItem(EBAY_PRIVACY_POLICY_KEY).includes(deletedSeller),false);
  assert.deepEqual(readEbayPrivacyPolicy(s),policy);
  s.setItem(EBAY_PRIVACY_POLICY_KEY,"bad json"); assert.throws(() => readEbayPrivacyPolicy(s));
});
test("server pages are bounded, monotonic and committed only after final verified page", async () => {
  const s = storage(); let count=0;
  const result = await refreshEbayPrivacyPolicy({storage:s,rpc:async (name,args) => {
    assert.equal(name,"code3_ebay_privacy_tombstones"); assert.equal(args.p_limit,500); assert.equal(s.getItem(EBAY_PRIVACY_POLICY_KEY),null);
    count++; return {data:{tombstones:[{sequence:count,kind:"username",hash:ebayIdentityHash("username",`synthetic-${count}`)}],nextAfter:count,hasMore:count===1}};
  }});
  assert.equal(result.after,2); assert.equal(result.tombstones.length,2);
});
test("malformed/repeated/error pages and account switch do not replace cached policy", async () => {
  for (const response of [{data:{tombstones:[],nextAfter:3,hasMore:true}},{data:{tombstones:[{sequence:3,kind:"username",hash:"bad"}],nextAfter:4,hasMore:false}},{error:{message:"no permission"}}]) {
    const s=storage(); writeEbayPrivacyPolicy(policy,s);
    await assert.rejects(refreshEbayPrivacyPolicy({storage:s,rpc:async()=>response})); assert.deepEqual(readEbayPrivacyPolicy(s),policy);
  }
  const s=storage(); await assert.rejects(refreshEbayPrivacyPolicy({storage:s,assertCurrent:()=>{throw new Error("Account changed");},rpc:async()=>{throw new Error("must not request");}}),/Account changed/); assert.equal(s.length,0);
});
test("sealed inline archive rewrites embedded raw source and reseals exact integrity", async () => {
  const original = await seal({format:"code3-device-workspace-archive",version:1,ownerId:"owner-1",raws:{"ember-and-tide.flip-scout.v1":JSON.stringify({deals:[row()]})}});
  const next = redactEbayArchive(original,policy); const {hash,...payload}=next;
  assert.notEqual(hash,original.hash); assert.equal(hash,await hashCanonicalJson(payload));
  assert.equal(next.raws["ember-and-tide.flip-scout.v1"].includes(deletedSeller),false);
  assert.equal(JSON.parse(next.raws["ember-and-tide.flip-scout.v1"]).deals[0].purchasePrice,40.27);
});
test("privacy never reseals a tampered safety archive as trusted new content", async () => {
  const original=await seal({format:"code3-device-workspace-archive",version:1,ownerId:"owner",raws:{"ember-and-tide.flip-scout.v1":JSON.stringify({deals:[row()]})}});
  original.ownerId="tampered";
  assert.throws(()=>redactEbayArchive(original,policy),/integrity/);
});
test("session draft archive and interrupted draft switch purge only matching personal details", async () => {
  const raw=JSON.stringify(row());
  const draftKey="private-business-hub.deal-analysis-draft.v1";
  const journal={version:1,from:"owner",to:null,beforeMarker:'{"version":1,"ownerId":"owner"}',before:{[draftKey]:raw},next:{[draftKey]:raw},status:"PREPARED"};
  const next=redactEbayArchive(journal,policy);
  assert.equal(next.before[draftKey].includes(deletedSeller),false); assert.equal(next.next[draftKey].includes(deletedSeller),false);
  assert.equal(JSON.parse(next.before[draftKey]).marketValue,80.12); assert.equal(next.beforeMarker,journal.beforeMarker);
  const archived=await seal({format:"code3-session-draft-archive",version:1,ownerId:"owner",raws:{[draftKey]:raw}});
  const result=redactEbayArchive(archived,policy); const {hash,...payload}=result;
  assert.equal(hash,await hashCanonicalJson(payload)); assert.equal(result.raws[draftKey].includes(deletedSeller),false);
});
test("IDB reference replacement follows prior migrations, produces verifiable new payload keys", async () => {
  const original = await seal({format:"code3-workspace-conflict-copy",version:1,sources:{"deal-finder":{schemaVersion:8,data:{deals:[row()]}}}});
  const next = redactEbayArchive(original,policy); const raw = canonicalStringify(next);
  const key=`conflict-copy:owner:copy:${original.hash}`; const location=redactedPayloadLocation(key,raw);
  const reference={format:"code3-workspace-conflict-reference",payloadKey:key,hash:original.hash};
  const result=redactEbayArchive(reference,policy,new Map([[key,{key:"intermediate",hash:"old"}],["intermediate",location]]));
  assert.equal(result.payloadKey,location.key); assert.equal(result.hash,next.hash); assert.equal(location.payloadHash,await hashCanonicalJson(raw));
});
test("device scrub excludes auth and unrelated keys, derives digest fences and preserves owner numbers", async () => {
  const raw=JSON.stringify({deals:[row()]}); const s=storage({"ember-and-tide.flip-scout.v1":raw,"sb-synthetic-auth-token":JSON.stringify({sellerName:deletedSeller}),"owner-costs":raw});
  const noPayloads={redactEbayPrivacy:async()=>new Map()};
  const result=await redactEbayDeviceCopies({storage:s,sessionStorage:storage(),policy,payloadStore:noPayloads});
  assert.deepEqual(result.changedKeys,["ember-and-tide.flip-scout.v1"]); assert.equal(s.getItem("owner-costs"),raw); assert.equal(s.getItem("sb-synthetic-auth-token"),JSON.stringify({sellerName:deletedSeller}));
  assert.equal(JSON.parse(s.getItem("ember-and-tide.flip-scout.v1")).deals[0].marketValue,80.12); assert.equal(readEbayPrivacyPolicy(s).tombstones.length,2);
});
test("prepared and committed checkpoints remain recoverable after targeted privacy resealing", async () => {
  const originalStorage=globalThis.localStorage;
  const sourceKey="ember-and-tide.flip-scout.v1";
  try {
    for (const status of ["PREPARED","COMMITTED"]) {
      delete globalThis.localStorage;
      const before=normalizeFlipScoutState({deals:[row()]},"2026-10-20T12:00:00Z");
      const after={...before,deals:[{...before.deals[0],ownerNotes:"Owner edited note"}]};
      const beforeRaw=canonicalStringify(before),afterRaw=canonicalStringify(after);
      const journal=await seal({format:"code3-workspace-recovery",version:1,ownerId:"owner",transactionId:"a".repeat(64),createdAt:"2026-10-20T12:00:00Z",status,entries:[{sourceId:"deal-finder",key:sourceKey,beforeExists:true,beforeValue:before,afterValue:after,beforeRawHash:await hashCanonicalJson(beforeRaw),afterRawHash:await hashCanonicalJson(afterRaw)}]},"integrity");
      const s=storage({[sourceKey]:status==="PREPARED"?beforeRaw:afterRaw,"code3.workspace-recovery.v1":canonicalStringify(journal)});
      globalThis.localStorage=s;
      await redactEbayDeviceCopies({storage:s,sessionStorage:storage(),policy,payloadStore:{redactEbayPrivacy:async()=>new Map()}});
      const result=await recoverWorkspaceSources({storage:s,ownerId:"owner",locks:{request:async(name,options,callback)=>callback({name})}});
      assert.equal(result.status,status==="PREPARED"?"ROLLED_BACK":"RECOVERED_COMMIT");
      const saved=JSON.parse(s.getItem(sourceKey)).deals[0]; assert.equal(saved.sellerName,undefined); assert.equal(saved.purchasePrice,40.27);
      assert.equal(saved.ownerNotes,status==="PREPARED"?"Keep this owner note":"Owner edited note");
    }
  } finally { if(originalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalStorage; }
});
test("current normalization, cloud capture, export, and old-backup restore cannot resurrect deleted seller", async () => {
  const originalStorage=globalThis.localStorage;
  const source=storage({"ember-and-tide.flip-scout.v1":JSON.stringify({schemaVersion:8,deals:[row()]})});
  try {
    globalThis.localStorage=source;
    const oldBackup=await createVerifiedBackup({localStorage:source}); assert.equal(oldBackup.verified,true);
    writeEbayPrivacyPolicy(policy,source);
    assert.equal(normalizeFlipScoutState({deals:[row()]}).deals[0].sellerName,undefined);
    assert.equal(serializeFlipScoutState({deals:[row()]}).includes(deletedSeller),false);
    const csv=recordsToCsv([row()], ["id","sellerName","listingUrl","purchasePrice","marketValue"]);
    assert.equal(csv.includes(deletedSeller),false); assert.equal(csv.includes("40.27"),true); assert.equal(csv.includes("80.12"),true);
    assert.equal(captureWorkspaceSources(source)["deal-finder"].data.deals[0].sellerName,undefined);
    const exported=await createVerifiedBackup({localStorage:source}); assert.equal(exported.verified,true); assert.equal(JSON.stringify(exported.backup || exported.envelope).includes(deletedSeller),false);
    const target=storage(); writeEbayPrivacyPolicy(policy,target);
    const restored=await planWorkspaceRestore(oldBackup.json,{storage:target});
    assert.equal(restored.nextSources["deal-finder"].data.deals[0].sellerName,undefined);
    assert.equal(restored.nextSources["deal-finder"].data.deals[0].marketValue,80.12);
  } finally { if(originalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalStorage; }
});
