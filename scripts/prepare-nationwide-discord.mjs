import {copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
for(const folder of ['role-picker','community-feed']){
 for(const [source,name] of [['src/data/usLocationIndex.json','usLocationIndex.json'],['src/utils/nationwideLocation.mjs','nationwideLocation.mjs']])copyFileSync(fileURLToPath(new URL(source,root)),fileURLToPath(new URL(`integrations/discord/${folder}/${name}`,root)));
}
console.log('Prepared shared public city/ZIP data for the Discord functions. No credentials are read.');
