import {useEffect,useId,useRef,useState} from 'react';
import {normalizeProductPhotoQuery,readProductPhotoText,validateProductPhotoFile,PRODUCT_PHOTO_LIMITS} from '../utils/productPhotoLookup.mjs';
import './product-photo-lookup.css';

// Only the explicitly reviewed query leaves this component. The selected file,
// preview URL and complete OCR text are never sent to a parent or saved.
export default function ProductPhotoLookup({onQuery,onDraftChange,initialQuery='',disabled=false,kind='item',reader=readProductPhotoText}){
 const id=useId(),sequence=useRef(0),controller=useRef(null),previewRef=useRef(''),edited=useRef(false),queryRef=useRef(null);
 const [preview,setPreview]=useState(''),[fileName,setFileName]=useState(''),[query,setQuery]=useState(initialQuery),[text,setText]=useState(''),[suggestions,setSuggestions]=useState([]),[busy,setBusy]=useState(false),[searching,setSearching]=useState(false),[progress,setProgress]=useState(null),[message,setMessage]=useState(''),[error,setError]=useState('');
 useEffect(()=>()=>{sequence.current++;controller.current?.abort();if(previewRef.current)URL.revokeObjectURL(previewRef.current);},[]);
 function stop(){sequence.current++;controller.current?.abort();controller.current=null;setBusy(false);setProgress(null);}
 function clearPreview(){if(previewRef.current)URL.revokeObjectURL(previewRef.current);previewRef.current='';setPreview('');setFileName('');}
 async function choose(event){
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  onDraftChange?.();
  stop();clearPreview();setError('');setMessage('');setText('');setSuggestions([]);setQuery('');edited.current=false;
  const invalid=validateProductPhotoFile(file);if(invalid){setError(invalid);return;}
  const request=sequence.current,abort=new AbortController();controller.current=abort;
  previewRef.current=URL.createObjectURL(file);setPreview(previewRef.current);setFileName(file.name);setBusy(true);
  try{
   const result=await reader(file,{signal:abort.signal,onProgress:value=>{if(request===sequence.current)setProgress(value);}});
   if(request!==sequence.current||abort.signal.aborted)return;
   setText(result.text||'');setSuggestions(result.suggestions||[]);if(!edited.current){onDraftChange?.();setQuery(result.query||'');}
   setMessage(result.message||'Review the text before searching.');
   if(['invalid','failed','unsupported','timeout'].includes(result.status))setError(result.message||'Type the details below to continue.');
  }catch{if(request===sequence.current&&!abort.signal.aborted)setError('The photo could not be read. Type the product details below.');}
  finally{if(request===sequence.current){setBusy(false);setProgress(null);controller.current=null;}}
 }
 async function search(){
  const value=normalizeProductPhotoQuery(query);if(!value||disabled||busy||searching||typeof onQuery!=='function')return;
  const request=sequence.current;setSearching(true);setError('');
  try{await onQuery(value);}
  catch{if(request===sequence.current)setError('Catalog search did not finish. Your search text is still here; try again.');}
  finally{if(request===sequence.current)setSearching(false);}
 }
 const subject=kind==='card'?'card':kind==='sealed'?'sealed product':'card or sealed product';
 return <section className="product-photo-lookup" aria-labelledby={`${id}-title`}>
  <header><h3 id={`${id}-title`}>Find from a photo</h3><p>Photograph the printed name, card number or barcode on your {subject}.</p></header>
  <div className="product-photo-lookup__pickers">
   <label className="product-photo-lookup__picker">Take photo<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="Take a product photo" disabled={disabled||searching} onChange={choose}/></label>
   <label className="product-photo-lookup__picker">Choose image<input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a product image" disabled={disabled||searching} onChange={choose}/></label>
  </div>
  <p className="product-photo-lookup__privacy">Your photo stays on this device. Text reading does not identify artwork, foil, condition or grade.</p>
  {preview&&<div className="product-photo-lookup__source"><img src={preview} alt="Selected product photo"/><div><span>{fileName}</span><button type="button" disabled={disabled||searching} onClick={()=>{onDraftChange?.();stop();clearPreview();setText('');setSuggestions([]);setMessage('Photo removed. You can use the search text below.');}}>Remove photo</button></div></div>}
  {busy&&<div className="product-photo-lookup__progress"><p role="status">{progress?.label||'Preparing photo on this device…'}</p><progress aria-label="Reading photo text" max="1" value={Number.isFinite(progress?.progress)?progress.progress:undefined}/><button type="button" onClick={()=>{onDraftChange?.();stop();setMessage('Reading stopped. You can type the details below.');queryRef.current?.focus();}}>Stop reading</button></div>}
  {!busy&&message&&!error&&<p role="status">{message}</p>}
  {error&&<p role="alert" className="product-photo-lookup__error">{error}</p>}
  {suggestions.length>0&&<div className="product-photo-lookup__suggestions" aria-label="Text suggestions">{suggestions.map(row=><button key={`${row.type}:${row.value}`} type="button" disabled={disabled||searching} onClick={()=>{onDraftChange?.();edited.current=true;setQuery(row.value);queryRef.current?.focus();}}><small>{row.label}</small>{row.value}</button>)}</div>}
  <label className="product-photo-lookup__query" htmlFor={`${id}-query`}>Search text<input ref={queryRef} id={`${id}-query`} value={query} maxLength={PRODUCT_PHOTO_LIMITS.maxQueryLength} autoComplete="off" disabled={disabled||searching} placeholder="Name, set, card number or barcode" aria-describedby={`${id}-review`} onChange={event=>{onDraftChange?.();edited.current=true;setQuery(event.target.value);}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();void search();}}}/></label>
  <p id={`${id}-review`}>Correct any misread text, then review the matches. Full catalog search needs internet; offline results may be limited.</p>
  <button className="product-photo-lookup__search" type="button" onClick={search} disabled={disabled||busy||searching||!normalizeProductPhotoQuery(query)||typeof onQuery!=='function'}>{searching?'Searching…':'Review catalog matches'}</button>
  {text&&<details><summary>Text read from image</summary><pre>{text}</pre></details>}
 </section>;
}
