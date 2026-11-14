/* eslint-disable react-refresh/only-export-components -- tiny public preference helpers shared by the app shell */
import './readable-text.css';
export const READABLE_TEXT_KEY='code3.text-size.v1';
export function readTextSize(storage){try{return (storage===undefined?globalThis.localStorage:storage)?.getItem(READABLE_TEXT_KEY)==='larger'?'larger':'standard';}catch{return 'standard';}}
export function saveTextSize(value,storage){
  const size=value==='larger'?'larger':'standard';
  try{
    const target=storage===undefined?globalThis.localStorage:storage;
    if(!target)return {value:size,saved:false};
    target.setItem(READABLE_TEXT_KEY,size);
    return {value:size,saved:true};
  }catch{return {value:size,saved:false};}
}
export function applyTextSize(value,target=globalThis.document?.documentElement){if(target)target.dataset.textSize=value==='larger'?'larger':'standard';}
export default function ReadableTextPreference({value='standard',onChange}) {return <section className="readable-text-preference" aria-label="Text size"><h3>Text size</h3><div role="group" aria-label="Reading size">{['standard','larger'].map(size=><button type="button" key={size} aria-pressed={value===size} onClick={()=>onChange?.(size)}>{size==='standard'?'Standard':'Larger'}</button>)}</div><p className="readable-text-sample" data-size={value}>Collection · 2 copies<br/><strong>Your item details stay easy to read.</strong></p><small>Applies to the app on this device.</small></section>;}
