import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { cardSurfaceProfile, surfaceLighting } from "../src/utils/cardSurface.mjs";
import assert from "node:assert/strict";
import { productInspectionProfile, inspectionPose, inspectionDrag, inspectionFace } from "../src/utils/productInspection.mjs";

test("only explicit finish/rarity metadata selects foil; names never invent a finish", () => {
  for (const finish of ["Reverse Holofoil", "reverse-holo", "Reverse Foil"]) assert.equal(productInspectionProfile({ catalogType: "card", finish }).initialFinish, "reverse");
  for (const finish of ["Non-Holo", "Nonfoil", "Normal", "Regular"]) assert.equal(productInspectionProfile({ catalogType: "card", finish, rarity: "Holo Rare" }).initialFinish, "regular");
  assert.equal(productInspectionProfile({ catalogType: "card", rarity: "Holo Rare" }).initialFinish, "holo");
  assert.equal(productInspectionProfile({ catalogType: "card", name: "Reverse Holo Surprise", rarity: "Rare" }).knownFinish, false);
});
test("cards, boxes, packs and unspecified photos use separate geometry", () => {
  assert.equal(productInspectionProfile({ productClassification: "Raw card" }).shape, "card");
  assert.equal(productInspectionProfile({ cardNumber: "H9" }).shape, "card");
  assert.equal(productInspectionProfile({ catalogType: "sealed", productType: "Elite Trainer Box" }).shape, "box");
  assert.equal(productInspectionProfile({ catalogType: "sealed", productType: "Booster Pack" }).shape, "pack");
  assert.equal(productInspectionProfile({ catalogType: "sealed", cardNumber: "contents" }).shape, "box");
  assert.equal(productInspectionProfile({ name: "Unidentified purchase" }).shape, "photo");
});
test("unverified items never borrow a front or unrelated side/back photo", () => {
  assert.equal(productInspectionProfile({ imageUrl: "front", photos: ["receipt", "unlabelled-other"] }).back, "");
  assert.equal(productInspectionProfile({ backImageUrl: "private-back", images: { back: "other" } }).back, "private-back");
  assert.equal(productInspectionProfile({ images: { back: "explicit-back" }, leftImageUrl: "left", rightImageUrl: "right" }).left, "left");
});
test("full turns stay finite, retain the front/back relation and clamp vertical tilt", () => {
  assert.deepEqual(inspectionPose(1080, 100), { yaw: 0, pitch: 28 });
  assert.deepEqual(inspectionPose(-1080, -100), { yaw: 0, pitch: -28 });
  assert.deepEqual(inspectionPose(Infinity, NaN), { yaw: 0, pitch: 0 });
  assert.equal(inspectionFace(180), "Back view"); assert.equal(inspectionFace(90), "Side view"); assert.equal(inspectionFace(360), "Front view");
  assert.deepEqual(inspectionDrag({ yaw: 0, pitch: 0 }, 400, 99999, 300), { yaw: -80, pitch: -28 });
});
test("inspection leaves original costs, price, copy quantity and photo references byte-identical", () => {
  const item = Object.freeze({ id: "owned", catalogType: "card", finish: "Reverse Holo", quantity: 2, allocatedItemCost: 4, marketPrice: 69.22, priceCheckedAt: "2026-11-09", backImageUrl: "private-reference" });
  const before = JSON.stringify(item); productInspectionProfile(item); inspectionDrag({ yaw: 0, pitch: 0 }, 128, 30, 390);
  assert.equal(JSON.stringify(item), before);
});

test("all six faces belong to the exact standard ETB and cached shop images retain their provenance", () => {
  const manifest = JSON.parse(readFileSync("src/data/productInspectionFaces.json", "utf8"))["tcgplayer:672401"];
  assert.equal(manifest.model, "10-10372-111"); assert.equal(manifest.upc, "0196214152038");
  assert.deepEqual(Object.keys(manifest.faces).sort(), ["back","bottom","front","left","right","top"]);
  assert.equal(new Set(Object.values(manifest.faces).map(face=>face.src+JSON.stringify(face.quad))).size,6);
  for(const [name,face] of Object.entries(manifest.faces)) {
    assert.equal(face.quad.length,4); assert.ok(face.quad.flat().every(n=>Number.isFinite(n)&&n>=0&&n<=1));
    assert.match(face.sourcePage,/^https:\/\//);
    if(face.sourceKind === "shop-product-photo") {
      assert.equal(createHash("sha256").update(readFileSync("public"+face.src)).digest("hex"),face.sha256);
      assert.match(face.sourceImage,/^https:\/\/i\.ebayimg\.com\//);
    } else assert.ok(["front","left"].includes(name));
  }
});
test("box tilt can reach top and bottom without changing the card tilt limit", () => {
  assert.equal(inspectionPose(0,120,90).pitch,90);assert.equal(inspectionPose(0,-120,90).pitch,-90);
  assert.equal(inspectionFace(0,-90),"Top view"); assert.equal(inspectionFace(0,90),"Bottom view");
  assert.equal(inspectionPose(0,90).pitch,28);
});
test("material layouts follow the actual card era; full-art remains full-art", () => {
  assert.equal(cardSurfaceProfile({setName:"Aquapolis"}).layout,"e-reader");
  assert.equal(cardSurfaceProfile({setName:"Skyridge"}).layout,"e-reader");
  assert.equal(cardSurfaceProfile({setName:"Scarlet & Violet"}).layout,"modern");
  assert.equal(cardSurfaceProfile({setName:"Base Set"}).layout,"classic");
  assert.equal(cardSurfaceProfile({setName:"Aquapolis"},{fullArt:true}).layout,"full");
  assert.equal(cardSurfaceProfile({game:"Magic: The Gathering",setName:"Aquapolis"}).layout,"unknown");
  assert.equal(productInspectionProfile({catalogType:"card",game:"Pokemon",setName:"Team Rocket",rarity:"Secret Rare",finish:"Holofoil"}).fullArt,false);
  assert.equal(productInspectionProfile({catalogType:"card",game:"Pokemon",rarity:"Special Illustration Rare",finish:"Holofoil"}).fullArt,true);
});
test("reflections follow tilt, leave the back unlit, and stay finite over a full spin", () => {
  const left=surfaceLighting(-20,0), right=surfaceLighting(20,0);
  assert.ok(left.x>right.x); assert.notEqual(surfaceLighting(0,20).y,surfaceLighting(0,-20).y);
  assert.equal(surfaceLighting(180,0).strength,0);
  for(let yaw=-360;yaw<=360;yaw+=10)for(let pitch=-90;pitch<=90;pitch+=15){const v=surfaceLighting(yaw,pitch);assert.ok(Object.values(v).every(Number.isFinite));assert.ok(v.strength>=0&&v.strength<=.74);assert.ok(v.sheen>=.025&&v.sheen<=.13);}
  assert.ok(Object.values(surfaceLighting(Infinity,NaN,{x:Infinity,y:NaN})).every(Number.isFinite));
});

test("verified English Pokemon cards use the official back; other games, languages and special backs do not inherit it",()=>{
 const base={catalogType:"card",game:"Pokemon TCG",language:"English",name:"Aipom"};
 assert.equal(productInspectionProfile(base).faces.back.src,"/assets/inspection/pokemon-standard-back.jpg");
 assert.equal(productInspectionProfile({...base,language:"",source:"TCGCSV"}).faces.back.reference,true);
 assert.equal(productInspectionProfile({...base,language:"",source:"Pokemon TCG API JSON"}).faces.back.reference,true);
 for(const language of ["Japanese","ja","Chinese","Unknown"]){assert.equal(productInspectionProfile({...base,language}).faces.back,undefined);}
 assert.equal(productInspectionProfile({...base,languageCode:"ja"}).faces.back,undefined);
 assert.equal(productInspectionProfile({...base,game:"Magic: The Gathering"}).faces.back,undefined);
 assert.equal(productInspectionProfile({...base,catalogType:"sealed",productType:"Elite Trainer Box"}).faces.back,undefined);
 assert.equal(productInspectionProfile({...base,language:"",source:"Manual"}).faces.back,undefined);
 for(const name of ["Ancient Mew","World Championships deck card","Metal Pikachu","My First Battle","Custom card"]){assert.equal(productInspectionProfile({...base,name}).faces.back,undefined);}
});
test("a saved back photo always wins over a stock reference, with original records unchanged",()=>{
 const item=Object.freeze({catalogType:"card",game:"Pokemon",language:"English",source:"TCGCSV",backImageUrl:"private://owner-back",marketPrice:69.22,purchaseDate:"2026-10-01",allocatedItemCost:18,quantity:2});const before=JSON.stringify(item);
 const profile=productInspectionProfile(item);assert.equal(profile.faces.back.src,item.backImageUrl);assert.equal(profile.faces.back.reference,undefined);assert.equal(JSON.stringify(item),before);
 const specific=productInspectionProfile({...item,inspectionFaces:{back:{src:"/specific-back.jpg"}}});assert.equal(specific.faces.back.src,"/specific-back.jpg");
 const asset=JSON.parse(readFileSync("src/data/cardBackAssets.json","utf8")).pokemonInternational;
 assert.equal(createHash("sha256").update(readFileSync("public"+asset.src)).digest("hex"),asset.sha256);
 assert.match(asset.sourceImage,/^https:\/\/tcg\.pokemon\.com\//);
});
