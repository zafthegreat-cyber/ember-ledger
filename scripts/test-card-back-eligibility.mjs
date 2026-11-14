import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {standardCardBack,inspectionCardBack,inspectionCardFront} from '../src/utils/cardBacks.mjs';
import {productInspectionProfile} from '../src/utils/productInspection.mjs';
import reviewedBacks from '../src/data/reviewedCardBacks.json' with {type:'json'};

const base={catalogType:'card',game:'Pokemon TCG',language:'English',source:'TCGCSV'};
const back='/assets/inspection/pokemon-standard-back.jpg';

test('reviewed missing front remains bound to the exact regular signed card',()=>{
 const rows=JSON.parse(readFileSync('src/data/generated/pokemonTcgCards.json')),row=rows.find(r=>String(r.tcgplayerProductId)==='690281');
 assert.ok(inspectionCardFront(row)?.src.endsWith('raging-bolt-ex-front20261114h.webp'));
 for(const patch of [{tcgplayerProductId:'696841'},{name:row.name+' Gold Stamped'},{cardName:'Different card'},{card_number:'111/142'},{set_name:'Base Set'},{language:'Japanese'},{isProxy:true},{isSealed:true},{material:'metal'}])assert.equal(inspectionCardFront({...row,...patch}),null);
 for(const id of ['662172','693501'])assert.equal(standardCardBack(rows.find(r=>String(r.tcgplayerProductId)===id))?.src,back,'Jumbo Ice Cream is an ordinary Trainer card');
 assert.equal(standardCardBack({...base,name:'Jumbo Ice Cream',setName:'Jumbo Cards'}),null);
});

test('My First Battle cards use their actual reverse while whole retail packages remain photos',()=>{
 const rows=JSON.parse(readFileSync('src/data/generated/pokemonTcgCards.json')).filter(r=>r.setName==='My First Battle');
 const cards=rows.filter(r=>!['520781','520782'].includes(String(r.tcgplayerProductId)));
 assert.equal(cards.length,48);
 for(const row of cards){const before=JSON.stringify(row);assert.equal(inspectionCardBack(row)?.src,'/assets/inspection/pokemon-my-first-battle-back.jpg');assert.equal(inspectionCardBack({...row,set_name:'Base Set'}),null);assert.equal(inspectionCardBack({...row,language:'Japanese'}),null);assert.equal(inspectionCardBack({...row,collector_number:'1/102'}),null);assert.equal(inspectionCardBack({...row,tcgplayerProductId:'unreviewed'}),null);assert.equal(JSON.stringify(row),before);}
 for(const row of rows.filter(r=>!cards.includes(r))){assert.equal(inspectionCardBack(row),null);assert.equal(productInspectionProfile(row).shape,'photo');}
});

test('reviewed 2004 championship backs require exact product, printing and language',()=>{
  const rows=JSON.parse(readFileSync('src/data/generated/pokemonTcgCards.json'));
  const exact=rows.filter(row=>row.setName==='World Championship Decks' && /\b2004\b/.test(row.name));
  assert.equal(exact.length,95);
  for(const record of exact){
    const before=JSON.stringify(record);
    assert.equal(inspectionCardBack(record)?.src,'/assets/inspection/pokemon-worlds-2004-back.webp');
    assert.equal(productInspectionProfile(record).faces.back.reference,true);
    assert.equal(JSON.stringify(record),before);
  }
  const example=exact[0];
  assert.equal(inspectionCardBack({...example,collector_number:'1/102'}),null);
  assert.equal(inspectionCardBack({...example,printing:'World Championships 2005'}),null);
  for(const patch of [{tcgplayerProductId:'unknown'},{name:example.name.replace('2004','2005')},{cardName:'Different card'},{setName:'Jungle'},{cardNumber:'1/102'},{language:'Japanese'},{language_code:'ja'},{game:'Magic'},{isSealed:true},{isProxy:true},{material:'Metal'},{variant:'Jumbo'},{source:'Owner entry',sourceType:''}])assert.equal(inspectionCardBack({...example,...patch}),null,JSON.stringify(patch));
  const owned={...example,backImageUrl:'private-worlds-back.jpg',unitCost:24,marketPrice:30};
  const before=JSON.stringify(owned);
  assert.equal(productInspectionProfile(owned).faces.back.src,'private-worlds-back.jpg');
  assert.equal(JSON.stringify(owned),before);
  for(const record of rows.filter(row=>row.setName==='World Championship Decks' && !reviewedBacks.products[String(row.tcgplayerProductId)]))assert.equal(inspectionCardBack(record),null,record.name);
});

test('2005 cards use their own reviewed back and never borrow the 2004 printing',()=>{
 const rows=JSON.parse(readFileSync('src/data/generated/pokemonTcgCards.json')).filter(row=>row.setName==='World Championship Decks'&&/\b2005\b/.test(row.name));
 assert.equal(rows.length,86);
 for(const row of rows){assert.equal(inspectionCardBack(row)?.src,'/assets/inspection/pokemon-worlds-2005-back.webp');assert.equal(inspectionCardBack({...row,printing:'World Championships2004'}),null);assert.equal(inspectionCardBack({...row,language:'Japanese'}),null);}
});

test('2022–2025 printed backs stay specific to each reviewed player deck',()=>{
 const catalog=JSON.parse(readFileSync('src/data/generated/pokemonTcgCards.json'));
 const entries=Object.entries(reviewedBacks.products).filter(([,r])=>/^worlds202[2-5]-/.test(r.asset));
 assert.equal(entries.length,414);assert.equal(new Set(entries.map(([,r])=>r.asset)).size,16);
 for(const [id,identity]of entries){const row=catalog.find(r=>String(r.tcgplayerProductId)===id),before=JSON.stringify(row);assert.equal(inspectionCardBack(row)?.src,reviewedBacks.assets[identity.asset].src);assert.equal(inspectionCardBack({...row,tcgplayerProductId:'unknown'}),null);assert.equal(inspectionCardBack({...row,cardName:row.name+' Gold Signature'}),null);assert.equal(inspectionCardBack({...row,printing:'World Championships 2004'}),null);assert.equal(inspectionCardBack({...row,languageCode:'ja'}),null);assert.equal(JSON.stringify(row),before);}
 for(const id of ['696842','696841','696764','696767'])assert.equal(inspectionCardBack(catalog.find(r=>String(r.tcgplayerProductId)===id)),null);
});

test('2006 through 2019 exact printing backs reject unknown and conflicting identities',()=>{
 const catalog=JSON.parse(readFileSync('src/data/generated/pokemonTcgCards.json'));
 for(const [year,count] of [[2006,94],[2007,99],[2008,94],[2009,84],[2010,106],[2011,89],[2012,84],[2013,87],[2014,99],[2015,67],[2016,89],[2017,94],[2018,92],[2019,89]]){
  const rows=catalog.filter(r=>r.setName==='World Championship Decks'&&r.name.includes(' '+year+' ')&&String(r.tcgplayerProductId)!=='479839');
  assert.equal(rows.length,count);
  for(const row of rows){const before=JSON.stringify(row);assert.equal(inspectionCardBack(row)?.src,'/assets/inspection/pokemon-worlds-'+year+'-back.jpg');assert.equal(inspectionCardBack({...row,printing:'World Championships 2024'}),null);assert.equal(inspectionCardBack({...row,collector_number:'incorrect'}),null);assert.equal(JSON.stringify(row),before);}
 }
 assert.equal(inspectionCardBack(catalog.find(r=>String(r.tcgplayerProductId)==='479839')),null,'Energy artwork year cannot determine a different player deck year');
});

test('ordinary metal card titles and official Custom Catcher keep the international card back',()=>{
  for(const name of ['Metal Energy','Basic Metal Energy 008','Dark Metal Energy','Magnetic Metal Energy','Melmetal','Melmetal VMAX Secret','Lucario and Melmetal GX','Full Metal Lab','Metal Cube 01','Metal Frying Pan','Metal Goggles Secret','Metal Core Barrier','Metal Saucer','Custom Catcher','Custom Catcher Secret']){
    assert.equal(standardCardBack({...base,name})?.src,back,name);
  }
});

test('normal names never override actual material, custom, proxy or special printing',()=>{
  for(const patch of [{material:'metal'},{printing:'Metal'},{variant:'Custom'},{isCustom:true},{isProxy:true},{setName:'World Championship Decks'},{setName:'Jumbo Cards'},{language:'Japanese'},{languageCode:'ja'}])assert.equal(standardCardBack({...base,name:'Melmetal',...patch}),null,JSON.stringify(patch));
  for(const name of ['Metal Pikachu','Charizard Celebrations Metal Card','Melmetal Metal Card','Custom Charizard','Custom Catcher Proxy','Custom Vest','Ancient Mew','My First Battle','World Championships deck card'])assert.equal(standardCardBack({...base,name}),null,name);
});

test('explicit redemption codes and imported boxes never borrow the ordinary card back',()=>{
  for(const patch of [{name:'Code Card Journey Together'},{name:'Redemption',rarity:'Code Card'},{name:'Melmetal ex Box'},{name:'Trainer',isCodeCard:true},{name:'Pikachu',catalogType:'sealed'},{name:'Melmetal ex Box and Black Kyurem ex Box Set of 2'},{name:'151 Poster Collection'},{name:'Elite Trainer Box'},{name:'Rare Candy',isAccessory:true}])assert.equal(standardCardBack({...base,...patch}),null,JSON.stringify(patch));
  assert.equal(standardCardBack({...base,name:'Code Card',cardNumber:'001'}),null);
});

test('imported packaging and redeemable codes do not get a card-shaped crop or foil surface',()=>{
  const records=JSON.parse(readFileSync('src/data/generated/pokemonTcgCards.json'));
  for(const id of ['714416','575897','251484']) {
    const record=records.find(row=>String(row.tcgplayerProductId)===id);
    assert.ok(record,id);
    const original=JSON.stringify(record),profile=productInspectionProfile(record);
    assert.equal(profile.shape,'photo',record.name);
    assert.equal(profile.faces.back,undefined);
    assert.equal(JSON.stringify(record),original);
  }
  assert.equal(productInspectionProfile({...base,name:'Surprise Box',cardNumber:'187/214'}).shape,'card');
  assert.equal(productInspectionProfile({...base,name:'Deck Shield',cardNumber:'131/160'}).shape,'card');
  assert.equal(productInspectionProfile({...base,name:'Secret Box 2025 Riley McKay',setName:'World Championship Decks',cardNumber:''}).shape,'card');
});

test('a numbered ordinary Trainer title containing packaging words is not mistaken for a box',()=>{
  assert.equal(standardCardBack({...base,name:'Surprise Box',cardNumber:'187/214'})?.src,back);
  assert.equal(standardCardBack({...base,name:'Deck Shield',cardNumber:'131/160'})?.src,back);
  assert.equal(standardCardBack({...base,name:'Surprise Box',cardNumber:'187/214',isSealed:true}),null);
  for(const name of ['Metal Energy Prize Pack Series 1','Water Energy Prize Pack Series 3 Cosmos Holo'])assert.equal(standardCardBack({...base,name,setName:'Prize Pack Series Cards'})?.src,back);
  assert.equal(standardCardBack({...base,name:'Prize Pack Series 1',setName:'Prize Pack Series Cards'}),null);
});

test('English-source and unknown-language boundaries stay conservative',()=>{
  assert.equal(standardCardBack({...base,name:'Melmetal',language:''})?.src,back);
  assert.equal(standardCardBack({...base,name:'Melmetal',language:'',source:'Owner entry'}),null);
  assert.equal(standardCardBack({...base,name:'Melmetal',game:'Magic: The Gathering'}),null);
  assert.equal(standardCardBack({...base,name:'Melmetal',language:'Unknown'}),null);
});

test('saved back photos and original valuation fields remain untouched',()=>{
  const record=Object.freeze({...base,name:'Melmetal',backImageUrl:'private-owner-back.jpg',quantity:2,unitCost:11.75,marketPrice:69.22,priceCheckedAt:'2026-11-14T12:00:00Z'});
  const before=JSON.stringify(record);
  assert.equal(productInspectionProfile(record).faces.back.src,'private-owner-back.jpg');
  assert.equal(JSON.stringify(record),before);
});

test('real catalog regression cases preserve distinct identities and original prices',()=>{
  const rows=JSON.parse(readFileSync('src/data/generated/pokemonTcgCards.json'));
  const get=id=>rows.find(row=>String(row.tcgplayerProductId)===id);
  for(const id of ['87369','277016','178997','178998','476145','476140'])assert.equal(standardCardBack(get(id))?.src,back,id);
  for(const id of ['665118','662750','519481','482049','108589','726547'])assert.equal(standardCardBack(get(id)),null,id);
  for(const row of rows.filter(row=>/^code card\b/i.test(row.name)||row.rarity==='Code Card'))assert.equal(standardCardBack(row),null,row.id);
  for(const row of rows.filter(row=>row.setName==='World Championship Decks'))assert.equal(standardCardBack(row),null,row.id);
});
