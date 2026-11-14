import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { buildCardVersionIndex, cardVersionProduct, cardVersionQuantity, cardVersionOf } from "../src/utils/cardVersions.mjs";
import { createSetCatalogItemSeed } from "../src/utils/setCatalog.mjs";
import { faceProjection, inspectionImageUrl } from "../src/utils/faceProjection.mjs";
const require = createRequire(import.meta.url);
const { normalizeTcgCsvGroup } = require("./sync-catalog-prices-stores.cjs");

test("normal refresh retains Normal and Reverse Holo quotes while its established default price stays unchanged",()=>{
  const product={productId:1,name:"Test card",cleanName:"Test card",categoryId:3,groupId:1,extendedData:[{name:"Number",value:"1/100"},{name:"Rarity",value:"Common"}]};
  const normal={productId:1,subTypeName:"Normal",marketPrice:10,lowPrice:7},reverse={productId:1,subTypeName:"Reverse Holofoil",marketPrice:18,lowPrice:12};
  const out=normalizeTcgCsvGroup({success:true,results:[product]},{success:true,results:[reverse,normal]},{groupId:1,name:"Sample set"},"2026-11-09T00:00:00Z");
  assert.equal(out.cards[0].marketPrice,10); assert.equal(out.marketPrices.length,2); assert.deepEqual(out.marketPrices.map(x=>x.marketPrice).sort((a,b)=>a-b),[10,18]);
});
test("version quotes stay source/currency scoped, choose the newest valid value, and preserve unknown/zero prices",()=>{
  const rows=[{tcgplayerProductId:"1",variant:"Normal",marketPrice:10,priceCheckedAt:"2026-11-01"},{tcgplayerProductId:"1",variant:"Reverse Holofoil",marketPrice:0},{tcgplayerProductId:"1",variant:"Normal",marketPrice:12,priceCheckedAt:"2026-11-09"},{tcgplayerProductId:"1",variant:"Normal",marketPrice:null,priceCheckedAt:"2026-11-10"},{tcgplayerProductId:"1",variant:"Normal",marketPrice:99,currency:"EUR"}];
  const versions=buildCardVersionIndex(rows).get("1");assert.equal(versions.length,2);assert.equal(versions[0].marketPrice,12);assert.equal(versions[1].marketPrice,0);
});
test("selecting a version creates a new exact seed, never edits the base card or borrows another version's price",()=>{
  const item=Object.freeze({id:"catalog-1",tcgplayerProductId:"1",catalogType:"card",name:"Test card",marketPrice:10,quantity:6,purchaseDate:"2026-01-01",allocatedItemCost:2});const before=JSON.stringify(item);
  const option={key:"reverse holo",variant:"Reverse Holofoil",marketPrice:18,source:"TCGCSV",checkedAt:"2026-11-09"};
  const seed=createSetCatalogItemSeed({name:"Sample",gameId:"pokemon"},cardVersionProduct(item,option));assert.equal(seed.variant,"Reverse Holofoil");assert.equal(seed.marketPrice,18);assert.equal(seed.quantity,1);assert.equal(seed.purchaseDate,undefined);assert.equal(seed.id,undefined);
  assert.equal("marketPrice" in cardVersionProduct(item,{...option,marketPrice:null}),false);assert.equal(JSON.stringify(item),before);
});
test("only copies with a recorded matching version count toward that version",()=>{
  const records=Object.freeze([{variant:"Normal",quantity:2},{finish:"Reverse Holo",quantity:1},{quantity:3},{variant:"Holofoil",quantity:1}].map(Object.freeze));
  assert.equal(cardVersionQuantity(records,{key:"normal"}),2);assert.equal(cardVersionQuantity(records,{key:"reverse holo"}),1);assert.equal(cardVersionOf({finish:"Non-Holo"}),"normal");
});
test("edition and finish fields resolve together; switching versions cannot inherit a different edition",()=>{
  assert.equal(cardVersionOf({edition:'First Edition',finish:'Holofoil'}),'1st edition holo');
  assert.equal(cardVersionOf({edition:'Unlimited',finish:'Regular'}),'unlimited');
  assert.equal(cardVersionOf({edition:'Unlimited',variant:'1st Edition Holofoil'}),'edition conflict');
  const product={edition:'1st Edition',marketPrice:100};
  const selected=cardVersionProduct(product,{key:'unlimited holo',variant:'Unlimited Holofoil',marketPrice:20});
  assert.equal(selected.edition,'Unlimited');assert.equal(product.edition,'1st Edition');
  assert.equal(cardVersionProduct(product,{key:'normal',variant:'Normal',marketPrice:10}).edition,undefined);
});
test("face projection maps each photographed corner to the corresponding flat face corner",()=>{
  const quad=[[.25,.08],[.94,.16],[.94,.84],[.25,.92]],w=204,h=181,m=faceProjection(quad,w,h);const targets=[[0,0],[w,0],[w,h],[0,h]];
  quad.forEach(([x,y],i)=>{x*=w;y*=h;const z=m[3]*x+m[7]*y+1;assert.ok(Math.abs((m[0]*x+m[4]*y+m[12])/z-targets[i][0])<1e-6);assert.ok(Math.abs((m[1]*x+m[5]*y+m[13])/z-targets[i][1])<1e-6);});
  assert.equal(faceProjection([[0,0],[0,0],[0,0],[0,0]],200,200),null);
});
test("higher-resolution artwork upgrades only the documented public CDN format",()=>{
  assert.equal(inspectionImageUrl("https://tcgplayer-cdn.tcgplayer.com/product/85317_200w.jpg"),"https://tcgplayer-cdn.tcgplayer.com/product/85317_in_1000x1000.jpg");
  for(const src of ["private://photo","/local.jpg","https://example.com/product/85317_200w.jpg"])assert.equal(inspectionImageUrl(src),src);
});
