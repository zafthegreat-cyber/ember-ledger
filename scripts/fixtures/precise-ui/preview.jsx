import React,{useState,useRef} from "react";
import {createRoot} from "react-dom/client";
import {CollectionWorkspace,BusinessWorkspace} from '../../../src/pages/EverydayWorkspaces.jsx';
import RestocksScreen from '../../../src/features/flipScout/screens/RestocksScreen.jsx';
const sampleCollection=[{"id":"preview-item-0","catalogProductId":"tcgcsv-502006","name":"151 Alakazam ex Collection","setName":"SV: Scarlet & Violet 151","tcgGame":"pokemon","imageUrl":"https://tcgplayer-cdn.tcgplayer.com/product/502006_200w.jpg","productClassification":"Sealed","isSealed":true,"quantity":1,"totalCost":45,"projectedResaleMid":60,"ownedItemPurpose":"PERSONAL_COLLECTION","purchaseDate":"2026-11-01","storageLocation":"Shelf A","condition":"Sealed","language":"English"},{"id":"preview-item-1","catalogProductId":"tcgcsv-502001","name":"151 Poster Collection","setName":"SV: Scarlet & Violet 151","tcgGame":"pokemon","imageUrl":"https://tcgplayer-cdn.tcgplayer.com/product/502001_200w.jpg","productClassification":"Sealed","isSealed":true,"quantity":2,"totalCost":90,"projectedResaleMid":60,"ownedItemPurpose":"PERSONAL_COLLECTION","purchaseDate":"2026-11-01","storageLocation":"Shelf A","condition":"Sealed","language":"English"},{"id":"preview-item-2","catalogProductId":"tcgcsv-672401","name":"Perfect Order Elite Trainer Box","setName":"ME03: Perfect Order","tcgGame":"pokemon","imageUrl":"https://tcgplayer-cdn.tcgplayer.com/product/672401_200w.jpg","productClassification":"Sealed","isSealed":true,"quantity":3,"totalCost":135,"projectedResaleMid":60,"ownedItemPurpose":"PERSONAL_COLLECTION","purchaseDate":"2026-11-01","storageLocation":"Shelf A","condition":"Sealed","language":"English"}];
const sampleInventory=sampleCollection.map((r,i)=>({...r,id:'preview-stock-'+i,ownedItemPurpose:'FOR_RESALE',status:'Available',quantity:4+i}));
const sampleSales=[{id:'preview-sale-1',inventoryItemId:'preview-stock-0',title:'Alakazam collection',status:'Completed',quantitySold:1,grossSalePrice:65,saleDate:'2026-11-10',salesChannel:'In person'},{id:'preview-sale-2',inventoryItemId:'preview-stock-1',title:'Poster collection',status:'Draft',quantitySold:1,grossSalePrice:40,saleDate:'2026-11-12',salesChannel:'Local pickup'}];
import OperationsHome from "../../../src/pages/OperationsHome.jsx";
import DealsScreen from "../../../src/features/flipScout/screens/DealsScreen.jsx";
import {resolveExperiencePresentation} from "../../../src/utils/experiencePresentation.js";
import "../../../src/features/flipScout/flipScout.css";
import "../../../src/App.css";
import "../focused-ui/preview.css";
const stores=[{id:"preview-1",name:"Target · Town Center",retailer:"Target"},{id:"preview-2",name:"Walmart · Lynnhaven",retailer:"Walmart"},{id:"preview-3",name:"GameStop · Pembroke",retailer:"GameStop"},{id:"preview-4",name:"Local card shop",retailer:"Independent"}];
function Preview(){
 const [theme,setTheme]=useState("dark"),[page,setPage]=useState("Home"),[notice,setNotice]=useState("");
 const [prefs,setPrefs]=useState({}),[mode,setMode]=useState("normal"),[pending,setPending]=useState(false);
 const completion=useRef(null);
 const [deals,setDeals]=useState([
 {id:"demo-1",title:"Booster box to compare",askingPrice:"125",status:"Watching",marketplace:"Saved shop link",dateDiscovered:new Date().toISOString()},
 {id:"demo-2",title:"Binder listing · price not entered",askingPrice:"",status:"New",marketplace:"Manual URL",dateDiscovered:"unknown"},
 {id:"demo-3",title:"Example zero-price listing",askingPrice:0,status:"New",marketplace:"Sample only",dateDiscovered:new Date().toISOString()}
 ]);
 const presentation=resolveExperiencePresentation();
 const open=label=>setNotice(label+" selected — preview only.");
 async function saveLayout(keys){
  if(mode==="fail")throw Error("Simulated save failure");
  if(mode==="delay"){setPending(true);const ok=await new Promise(resolve=>{completion.current=resolve});setPending(false);if(!ok)return false;}
  setPrefs({pagePreferences:{hearth:{visibleKeys:keys,updatedAt:new Date().toISOString()}}});setNotice("Home layout saved in preview memory.");return true;
 }
 return <div className="app app-command-shell focused-preview" data-theme={theme}>
 <header className="preview-toolbar"><strong>CODE 3 TCG <small>Precise pages · unpublished preview</small></strong><button onClick={()=>setTheme(t=>t==="dark"?"light":"dark")}>{theme==="dark"?"Light":"Dark"} theme</button></header>
 <nav className="preview-tabs" aria-label="Preview screens">{["Home","Collection","Sets","Inventory","Sales","Restocks","Saved listings"].map(p=><button key={p} aria-current={page===p?"page":undefined} onClick={()=>{setPage(p);setNotice("")}}>{p}</button>)}<a href="/scripts/fixtures/settings-clarity/index.html">Settings preview</a></nav>
 <main className="preview-main">
 {notice&&<p role="status">{notice}</p>}
 {page==="Home"?<OperationsHome setActiveTab={open} onReportRestock={options=>setNotice(options?.quick?"Review ready: "+options.store.name+" · "+options.reportType+". Nothing posted.":"Restock form selected — preview only.")} onOpenRestockReports={()=>open("Browse reports")} scoutSnapshot={{stores}} isWatchedEmberStore={()=>true} experiencePresentation={presentation} personalizationPreferences={prefs} onSaveHomeShortcuts={saveLayout} onOpenFind={()=>setPage("Saved listings")} onOpenExperienceSettings={()=>open("Settings")}/>:page==='Collection'||page==='Sets'?<CollectionWorkspace key={page} initialView={page==='Sets'?'sets':'collection'} items={sampleCollection} portfolioScope="precise-ui-sample" portfolioFeatures={{value:true,history:true,export:true}}/>:page==='Inventory'||page==='Sales'?<BusinessWorkspace key={page} initialView={page==='Sales'?'sales':'inventory'} items={sampleInventory} sales={sampleSales}/>:page==='Restocks'?<RestocksScreen onOpenRestocks={()=>open('Browse reports')} onReportRestock={()=>open('Report form')}/>:<DealsScreen deals={deals} experiencePresentation={presentation} onSave={async(_,record)=>{const saved={...record,id:record.id||"preview-"+Date.now()};setDeals(rows=>[saved,...rows.filter(r=>r.id!==saved.id)]);return saved}} onDelete={async(_,id)=>{setDeals(rows=>rows.filter(r=>r.id!==id));return true}} onAnalyze={()=>open("Compare costs")}/>}
 <details className="preview-test-tools"><summary>Preview test tools</summary><label>Home save simulation <select aria-label="Home save simulation" value={mode} onChange={e=>setMode(e.target.value)}><option value="normal">Normal</option><option value="fail">Failed save</option><option value="delay">Delayed save</option></select></label>{pending&&<div><button onClick={()=>completion.current?.(true)}>Finish sample save</button><button onClick={()=>completion.current?.(false)}>Fail sample save</button></div>}</details>
 </main><footer className="preview-footer">Sample records only · No account, catalog, or price changes</footer></div>
}
const root=createRoot(document.getElementById("root"));root.render(<Preview/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
