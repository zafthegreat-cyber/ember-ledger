import test from 'node:test';
import assert from 'node:assert/strict';
import index from '../src/data/usLocationIndex.json' with {type:'json'};
import {resolveArea,searchAreas,matchesNearby,locationScopeMatch,distanceMiles} from '../src/utils/nationwideLocation.mjs';
import {prepareRestockFeedEntries,filterRestockFeed} from '../src/utils/restockFeedPresentation.mjs';
import {loadCommunityReports} from '../src/services/communityReports.mjs';

test('single city/ZIP search covers 50 states and DC, leading zeros, Alaska and Hawaii',()=>{
 assert.equal(new Set(index.places.map(p=>p[2])).size,51);
 for(const state of Object.keys(index.states)) assert.ok(searchAreas(index,`${index.places.find(p=>p[2]===state)[1]} ${state}`).some(p=>p.state===state),state);
 for(const [zip,state,city] of [['23435','VA','Suffolk'],['78701','TX','Austin'],['99501','AK','Anchorage'],['96813','HI','Honolulu'],['01001','MA','Agawam']]){
  const [area]=searchAreas(index,zip);assert.equal(area.state,state);assert.match(area.city,new RegExp(city));assert.equal(area.zip,zip);
 }
 assert.equal(searchAreas(index,'78701-1234')[0].state,'TX');
 assert.deepEqual(searchAreas(index,'00000'),[]);assert.equal(resolveArea(index,'us-0000000'),null);
 assert.ok(searchAreas(index,'Richmond CA').every(a=>a.state==='CA'));assert.ok(searchAreas(index,'Richmond VA').every(a=>a.state==='VA'));
 assert.equal(searchAreas(index,'Austin Texas')[0].state,'TX');assert.equal(searchAreas(index,'Virginia Beach Virginia')[0].city,'Virginia Beach');
});
test('nearby uses a radius across state lines, exact city/state fallback and keeps Online separate',()=>{
 const area=searchAreas(index,'Washington DC')[0];assert.ok(area);
 assert.ok(distanceMiles(area,{lat:38.88,lng:-77.10})<10);
 assert.equal(matchesNearby({city:'Arlington',state:'VA',latitude:38.88,longitude:-77.10},area,25),true);
 assert.equal(matchesNearby({city:'Washington',state:'WA'},area,25),false);
 assert.equal(matchesNearby({city:'Washington',state:'DC'},area,25),true);
 assert.equal(matchesNearby({city:'Washington',state:'District of Columbia'},area,25),true);
 assert.equal(matchesNearby({city:'Unknown'},area,25),false);
 assert.equal(locationScopeMatch({kind:'online'},{mode:'nearby',area,radius:25}),false);
 assert.equal(locationScopeMatch({kind:'online'},{mode:'online'}),true);
});
test('nearby filtering preserves report visibility input and combines product and time filters without mutating records',()=>{
 const area=searchAreas(index,'Austin TX')[0],now=Date.parse('2026-11-08T20:00:00Z');
 const reports=[{id:'a',city:'Austin',state:'TX',stockStatus:'low_stock',productCategory:'Riftbound',observedAt:new Date(now).toISOString()},{id:'b',city:'Austin',state:'MN',stockStatus:'low_stock',productCategory:'Riftbound',observedAt:new Date(now).toISOString()}];
 const saved=JSON.stringify(reports),entries=prepareRestockFeedEntries(reports);
 assert.deepEqual(filterRestockFeed(entries,{location:{mode:'nearby',area,radius:25},game:'riftbound',period:'24h'},now).map(e=>e.report.id),['a']);
 assert.equal(JSON.stringify(reports),saved);assert.equal(filterRestockFeed(entries,{location:{mode:'all'}},now).length,2);
});

test('community feed requests the selected public area before loading reports and keeps Online separate',async()=>{
 const calls=[],now=Date.now(),area=searchAreas(index,'Austin Texas')[0];
 const fetchImpl=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({version:1,windowHours:24,generatedAt:new Date(now).toISOString(),reports:[]}),{headers:{'Content-Type':'application/json'}});};
 for(const location of [{mode:'nearby',area,radius:50},{mode:'online'},{mode:'all'}])await loadCommunityReports({fetchImpl,now,publicGatewayKey:'public-fixture',location});
 const near=new URL(calls[0].url);assert.equal(near.searchParams.get('near'),area.id);assert.equal(near.searchParams.get('miles'),'50');
 assert.equal(new URL(calls[1].url).searchParams.get('scope'),'online');assert.equal(new URL(calls[2].url).search,'');
 assert.ok(calls.every(c=>c.options.credentials==='omit'&&c.options.cache==='no-store'));
});
