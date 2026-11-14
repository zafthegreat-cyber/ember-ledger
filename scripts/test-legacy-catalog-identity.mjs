import test from "node:test";
import assert from "node:assert/strict";
import {buildLegacyCatalogIdentityUpdate,readLegacyCatalogIdentity,sanitizeLegacyCatalogIdentity} from "../src/utils/legacyCatalogIdentity.mjs";

test("reviewed local catalog identity roundtrips without changing original notes, price, quantity or owner",()=>{
  const notes='Receipt #42\r\n[IMPORT_DETAILS] {"purchaseDate":"2026-10-01"}\r\nKeep this original note exactly.  ';
  const record=Object.freeze({id:"original",owner_id:"owner",quantity:2,unitCost:17.5,marketPrice:83.15,priceCheckedAt:"2026-11-13T20:00:00Z",actionNotes:notes});
  const patch={catalogProductId:"tcgcsv:123",tcgplayerProductId:123,name:"Reviewed card",cardNumber:"004/100",variant:"Reverse Holofoil",edition:"Unlimited",tcgGame:"pokemon",language:"English",finish:"Reverse Holofoil",imageUrl:"/assets/card.jpg",id:"forbidden",owner_id:"other",quantity:900,unitCost:0,marketPrice:1,priceCheckedAt:"2030-01-01"};
  const result=buildLegacyCatalogIdentityUpdate({notes,identity:patch});assert.ok(result.actionNotes.startsWith(notes));assert.equal(result.serverPatch.catalog_product_id,null);assert.equal(result.serverPatch.tcgplayer_product_id,"123");
  const mapped={...record,...readLegacyCatalogIdentity(result.actionNotes)};for(const field of ["id","owner_id","quantity","unitCost","marketPrice","priceCheckedAt"])assert.equal(mapped[field],record[field]);assert.equal(mapped.cardNumber,"004/100");assert.equal(mapped.edition,"Unlimited");assert.equal(mapped.catalogProductId,"tcgcsv:123");
});
test("real UUID alone can populate database catalog link and later annotations retain all earlier notes",()=>{
  const first=buildLegacyCatalogIdentityUpdate({notes:"Original",identity:{catalogProductId:"f2510775-20cc-487e-95ae-f261761d994e",name:"First",language:"Japanese"}});assert.equal(first.serverPatch.catalog_product_id,"f2510775-20cc-487e-95ae-f261761d994e");
  const second=buildLegacyCatalogIdentityUpdate({notes:first.actionNotes,identity:{catalogProductId:"local:555",name:"Confirmed"}});assert.ok(second.actionNotes.startsWith(first.actionNotes));assert.equal(second.serverPatch.catalog_product_id,null);assert.deepEqual(readLegacyCatalogIdentity(second.actionNotes),{catalogProductId:"local:555",name:"Confirmed",language:"Japanese",tcgplayerProductId:""});
});
test("unrelated, corrupt, unsupported and malicious metadata cannot grant authority or rewrite financial data",()=>{
  assert.deepEqual(readLegacyCatalogIdentity('{"id":"bad"}\n[CODE3_CATALOG_IDENTITY_V2] {"identity":{"name":"bad"}}\n[CODE3_CATALOG_IDENTITY_V1] broken'),{});
  assert.deepEqual(sanitizeLegacyCatalogIdentity(JSON.parse('{"__proto__":{"admin":true},"id":"bad","role":"admin","ownerId":"other","marketPrice":3,"name":"Valid","imageUrl":"javascript:alert(1)"}')),{name:"Valid"});
  const original="Never change this";assert.equal(buildLegacyCatalogIdentityUpdate({notes:original,identity:{id:"bad",quantity:5}}).actionNotes,original);
});

test("explicit empty optional identity fields clear prior annotations without clearing names or catalog links",()=>{
  const original='Original notes  \r\n[IMPORT_DETAILS] {"unitCost":12,"quantity":2}\r\n';
  const first=buildLegacyCatalogIdentityUpdate({notes:original,identity:{catalogProductId:"local:555",tcgplayerProductId:"555",name:"Saved card",tcgGame:"pokemon",setName:"First set",variant:"Reverse Holofoil",finish:"Reverse Holofoil",printing:"First edition",imageUrl:"/card.jpg"}});
  const cleared=buildLegacyCatalogIdentityUpdate({notes:first.actionNotes,identity:{catalogProductId:"",name:"",tcgGame:"",setName:"",variant:"",finish:"",printing:"",imageUrl:"",language:"  ",quantity:0,marketPrice:0}});
  assert.ok(cleared.actionNotes.startsWith(first.actionNotes));
  assert.deepEqual(readLegacyCatalogIdentity(cleared.actionNotes),{catalogProductId:"local:555",tcgplayerProductId:"555",name:"Saved card",tcgGame:"pokemon",setName:"",variant:"",finish:"",printing:"",imageUrl:""});
  assert.equal(cleared.serverPatch.catalog_product_id,undefined);
  assert.equal(cleared.serverPatch.tcgplayer_product_id,undefined);
  assert.deepEqual(Object.keys(cleared.serverPatch),["action_notes"]);
});


test("explicit catalog replacement clears stale provider links while partial edits and reads retain them",()=>{
  const original='Original receipt note';
  const first=buildLegacyCatalogIdentityUpdate({notes:original,identity:{catalogProductId:"f2510775-20cc-487e-95ae-f261761d994e",tcgplayerProductId:"123",name:"First product"}});
  const partial=buildLegacyCatalogIdentityUpdate({notes:first.actionNotes,identity:{name:"Corrected spelling",finish:"Holofoil"}});
  assert.equal(partial.identity.tcgplayerProductId,"123");assert.equal(partial.serverPatch.tcgplayer_product_id,undefined);
  const same=buildLegacyCatalogIdentityUpdate({notes:partial.actionNotes,identity:{catalogProductId:"f2510775-20cc-487e-95ae-f261761d994e"}});
  assert.equal(same.identity.tcgplayerProductId,"123");assert.equal(same.serverPatch.tcgplayer_product_id,undefined);
  const replaced=buildLegacyCatalogIdentityUpdate({notes:same.actionNotes,identity:{catalogProductId:"local:replacement",name:"Reviewed replacement"}});
  assert.equal(replaced.serverPatch.catalog_product_id,null);assert.equal(replaced.serverPatch.tcgplayer_product_id,null);assert.equal(readLegacyCatalogIdentity(replaced.actionNotes).tcgplayerProductId,"");assert.ok(replaced.actionNotes.startsWith(same.actionNotes));
  const unannotated={tcgplayerProductId:"999",...readLegacyCatalogIdentity("No annotation")};assert.equal(unannotated.tcgplayerProductId,"999");
  assert.deepEqual(readLegacyCatalogIdentity('[CODE3_CATALOG_IDENTITY_V1] {"version":1,"identity":{"name":"Old metadata without provider ID"}}'),{name:"Old metadata without provider ID"});
});
