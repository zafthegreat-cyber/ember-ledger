import { buildLifecycleRecord, validateLifecycleTransition } from './contracts.js';
import { previewWishTargets } from './wishIdentity.js';
export function createCollectionLifecycleActions(repository,{isOwnerAuthorized=()=>false,now=()=>new Date().toISOString(),makeId=()=> 'operation-'+globalThis.crypto.randomUUID()}={}) {
 const requireOwner=()=>{if(!isOwnerAuthorized())throw new Error('Sign in to your own account before saving these changes.');};
 const current=()=>{requireOwner();const state=repository.load();if(repository.getLastError())throw new Error(repository.getLastError());return state;};
 return {
 previewWants(products){const state=current();return previewWishTargets(products,state.manualLifecycles||[]);},
 async addWants(products){return repository.runLocked(()=>{const state=current();const preview=previewWishTargets(products,state.manualLifecycles||[]);const additions=preview.targets.map(target=>{const {catalogIdentity,...values}=target;return {...buildLifecycleRecord('wish',values,null,{id:makeId(),at:now()}),catalogIdentity};});if(!additions.length)return {added:0,duplicates:preview.duplicates.length,state};const next={...state,manualLifecycles:[...state.manualLifecycles,...additions]};validateLifecycleTransition(state,next);requireOwner();const saved=repository.save(next);if(saved.error)throw new Error(saved.error);return {added:additions.length,duplicates:preview.duplicates.length,state:saved.state};});},
 async moveAssignment({id,expectedVersion,binderId,page,slot}){return repository.runLocked(()=>{const state=current(),previous=state.manualLifecycles.find(row=>row.id===id&&row.type==='assignment');if(!previous||previous.recordVersion!==expectedVersion)throw new Error('This assignment changed. Reopen the binder before moving it.');const record=buildLifecycleRecord('assignment',{itemId:previous.itemId,unit:previous.unit,binderId,page,slot},previous,{id,at:now()});const next={...state,manualLifecycles:state.manualLifecycles.map(row=>row.id===id?record:row)};validateLifecycleTransition(state,next);requireOwner();const result=repository.save(next);if(result.error)throw new Error(result.error);return {record,state:result.state};});}
 };
}
