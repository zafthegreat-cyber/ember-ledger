import index from './usLocationIndex.json' with {type:'json'};
import {resolveArea,searchAreas,areaKey} from './nationwideLocation.mjs';
export const nationalArea=key=>resolveArea(index,key);
export const nationalSearch=query=>searchAreas(index,query,8);
export function legacyArea(c,area){return c.regions.flatMap(r=>r.options).find(o=>area.state==='VA'&&areaKey(o.label)===areaKey(area.city));}
export function reportArea(c,key){return c.regions.flatMap(r=>r.options).find(o=>o.key===key)||nationalArea(key);}
export function reportAreaCenter(c,key){
 const national=nationalArea(key);if(national)return national;
 const old=reportArea(c,key);if(!old)return null;
 const city=old.label.replace(/ County$/u,'');
 return nationalSearch(`${city} VA`).find(a=>areaKey(a.city)===areaKey(city))||null;
}
