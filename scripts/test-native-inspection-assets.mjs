import test from "node:test";
import assert from "node:assert/strict";
import { inspectionAssetUrl } from "../src/utils/inspectionAssetUrl.mjs";
import { inspectionCardBack } from "../src/utils/cardBacks.mjs";
import { resolveInspectionArtwork, productInspectionProfile, inspectionGeometry } from "../src/utils/productInspection.mjs";
import registry from "../src/data/productInspectionFaces.json" with { type: "json" };

test("native renders hosted photos without rewriting local, private or web sources", () => {
  const photo = "/assets/inspection/pokemon-standard-back.jpg";
  assert.equal(inspectionAssetUrl(photo, {native:true}), `https://code3tcg.app${photo}`);
  assert.equal(inspectionAssetUrl(photo, {native:false}), photo);
  for(const source of ["/assets/inspection/../private.jpg", "/assets/inspection/art-mask.svg", "blob:photo", "private:receipt", "https://example.com/photo.jpg", "/owner.jpg"]) assert.equal(inspectionAssetUrl(source,{native:true}),source);
  assert.equal(inspectionAssetUrl(photo,{native:true,sha256:"a".repeat(64)}),`https://code3tcg.app${photo}?v=${"a".repeat(64)}`);
});
test("matching boxes and packs keep real geometry and a correct card reverse", () => {
  const model=registry["tcgplayer:672401"];
  const item=Object.freeze({name:model.name,tcgplayerProductId:"672401",catalogType:"sealed",quantity:2,marketPrice:69.22,priceCheckedAt:"2026-11-14",unitCost:50});
  const before=JSON.stringify(item);
  const art=resolveInspectionArtwork(item,registry);
  assert.equal(inspectionGeometry(productInspectionProfile(item,art)),"box");
  for(const face of Object.values(art.faces)) assert.match(inspectionAssetUrl(face.src,{native:true}),/^https:\/\/code3tcg\.app\/assets\/inspection\//);
  const back=inspectionCardBack({game:"pokemon",name:"Pikachu",language:"English",catalogType:"card"});
  assert.match(inspectionAssetUrl(back.src,{native:true}),/pokemon-standard-back.jpg$/);
  assert.equal(inspectionCardBack({game:"pokemon",name:"Pikachu",language:"Japanese",catalogType:"card"}),null);
  assert.equal(JSON.stringify(item),before);
});
