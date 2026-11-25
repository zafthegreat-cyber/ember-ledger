import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/utils/storageQuota.js',import.meta.url),'utf8');
const {storageQuotaStatus,estimateLocalStorageBytes}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function memory(value){return {length:1,key:()=> 'record',getItem:()=>value,setItem:()=>{throw Error('Must not probe or change saved data')},removeItem:()=>{throw Error('Must not remove data')}};}
test('large saved text never claims measured capacity or a percentage',()=>{
 const status=storageQuotaStatus(memory('x'.repeat(5_000_000)));
 assert.equal(status.level,'critical');assert.equal(status.percent,null);assert.equal(status.limit,null);assert.equal(status.capacityKnown,false);
 assert.match(status.message,/9.5 MiB/);assert.match(status.message,/size estimate/);assert.doesNotMatch(status.message,/almost full|191%|using.*of.*MB|remove items/);
});
test('UTF-16 text estimate counts keys and non-ASCII code units without writing',()=>{
 assert.equal(estimateLocalStorageBytes(memory('é😀')),18);
 assert.equal(storageQuotaStatus(memory('short')).level,'ok');
});
test('blocked reads are unknown, never reported as empty or safe',()=>{
 const status=storageQuotaStatus({length:1,key:()=>{throw Error('Blocked')}});
 assert.equal(status.level,'unknown');assert.equal(status.bytes,null);assert.equal(status.percent,null);
 assert.equal(storageQuotaStatus(null).level,'unknown');
});
test('a blocked localStorage getter is caught before status rendering',()=>{
 const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 try { Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('Blocked')}});assert.equal(storageQuotaStatus().level,'unknown'); }
 finally {if(old)Object.defineProperty(globalThis,'localStorage',old);else delete globalThis.localStorage;}
});
test('empty storage and invalid advisory thresholds are handled predictably',()=>{
 assert.equal(storageQuotaStatus({length:0,key:()=>null,getItem:()=>null}).level,'ok');
 assert.equal(storageQuotaStatus(memory('x'.repeat(5_000_000)),NaN).level,'critical');
 assert.equal(storageQuotaStatus(memory('x'.repeat(2_000_000))).level,'warn');
});
