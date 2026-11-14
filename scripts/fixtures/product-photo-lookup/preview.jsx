import React,{useState} from 'react';
import{createRoot}from'react-dom/client';
import ProductPhotoLookup from '../../../src/components/ProductPhotoLookup.jsx';
import {findCatalogProductsByBarcode}from '../../../src/utils/inventoryImportUtils.js';
import {getBestCatalogMatches}from '../../../src/utils/scanMatchUtils.js';
import sealed from '../../../src/data/generated/sealedProducts.json';
import cards from './fixtures.json';
import './preview.css';
const sample='/assets/inspection/destined-rivals-bundle-20261114f/bundle-398110175529-5.webp';
function Preview(){
 const[query,setQuery]=useState(''),[matches,setMatches]=useState([]),[kind,setKind]=useState('item'),[visible,setVisible]=useState(true);
 const pool=[...sealed,...cards];
 async function lookup(value){setQuery(value);const direct=findCatalogProductsByBarcode(pool,value);setMatches(direct.length?direct:getBestCatalogMatches(value,pool).slice(0,8).map(row=>row.item));}
 async function example(){const response=await fetch(sample);const file=new File([await response.blob()],'destined-rivals-original-bottom.webp',{type:'image/webp'}),data=new DataTransfer();data.items.add(file);const input=document.querySelector('input[aria-label="Choose a product image"]');input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));}
 return <main><div className="preview-tools"><strong>CODE 3 TCG</strong><span>Unpublished · no saves</span><button onClick={()=>document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark'}>Switch theme</button><button onClick={()=>setVisible(!visible)}>{visible?'Close preview':'Open preview'}</button></div><h1>Photo lookup</h1><p className="intro">Read printed details privately, then choose the right catalog item.</p><div className="example-controls"><label>Photo type<select value={kind} onChange={event=>setKind(event.target.value)}><option value="item">Any item</option><option value="card">Card</option><option value="sealed">Sealed product</option></select></label><button onClick={example} disabled={!visible}>Try a real packaging photo</button></div>{visible&&<ProductPhotoLookup kind={kind} onQuery={lookup} onDraftChange={()=>{setQuery('');setMatches([]);}}/>}<section aria-label="Preview catalog results"><h2>Catalog results</h2>{query?<><p>Reviewed query: <output data-testid="reviewed-query">{query}</output></p>{matches.length?<ul>{matches.map((row,index)=><li key={row.id+'-'+index}><strong>{row.name}</strong><small>{row.catalogType} · {row.setName}</small></li>)}</ul>:<p>No match in this preview. Edit the name or set and try again.</p>}</>:<p>No search yet. Reading a photo never adds an item.</p>}</section></main>;
}createRoot(document.getElementById('root')).render(<Preview/>);
