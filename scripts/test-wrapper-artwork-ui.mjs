import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { faceProjection } from "../src/utils/faceProjection.mjs";
import { wrapperGeometry } from "../src/utils/wrapperGeometry.mjs";
const registry=JSON.parse(readFileSync("src/data/productInspectionFaces.json","utf8")),model=registry["tcgplayer:504467"];
const product=JSON.parse(readFileSync("src/data/generated/sealedProducts.json","utf8")).find(item=>String(item.tcgplayerProductId)==="504467");
const output=await build({stdin:{contents:'export {default as Wrapper} from "./src/components/WrapperArtwork.jsx"; export {default as Viewer} from "./src/components/ProductInspectViewer.jsx";',resolveDir:process.cwd(),loader:"jsx"},bundle:true,platform:"node",format:"cjs",write:false,jsx:"automatic",loader:{".css":"empty"},external:["react","react/jsx-runtime"],define:{"import.meta.env":"{}"},logLevel:"silent"});
const module={exports:{}};new Function("require","module","exports",output.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
async function environment(run){
 const dom=new JSDOM('<main id="root"></main>',{url:"https://fixture.invalid/",pretendToBeVisual:true});
 const prior=new Map(),observers=new Set(),frames=new Map();let sequence=0,now=0,normal={width:180.25,height:332.77};
 const dimensions=node=>node.closest("dialog")?{width:270.25,height:498.55}:normal;
 const layout=node=>{const size=dimensions(node);return{width:size.width,height:node.classList.contains("product-inspect__texture")?parseFloat(node.closest(".product-inspect__wrapper-photo")?.style.height)||size.height:size.height};};
 const originalStyle=dom.window.getComputedStyle.bind(dom.window);
 dom.window.getComputedStyle=node=>node.classList.contains("product-inspect__wrapper")||node.classList.contains("product-inspect__texture")?{width:layout(node).width+"px",height:layout(node).height+"px"}:originalStyle(node);
 dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 Object.defineProperty(dom.window.HTMLElement.prototype,"clientWidth",{configurable:true,get(){return this.classList.contains("product-inspect__stage")?390:Math.round(layout(this).width);}});
 Object.defineProperty(dom.window.HTMLElement.prototype,"clientHeight",{configurable:true,get(){return this.classList.contains("product-inspect__stage")?540:Math.round(layout(this).height);}});
 class Observer{
  constructor(callback){this.callback=callback;this.targets=new Set();observers.add(this);}
  observe(node){this.targets.add(node);}
  disconnect(){this.targets.clear();observers.delete(this);}
 }
 const globals={window:dom.window,document:dom.window.document,ResizeObserver:Observer,IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:fn=>{frames.set(++sequence,fn);return sequence;},cancelAnimationFrame:id=>frames.delete(id)};
 for(const[key,value]of Object.entries(globals)){prior.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}
 const root=createRoot(document.getElementById("root"));
 const render=(name,props={})=>act(async()=>root.render(React.createElement(module.exports[name],name==="Viewer"?{product,src:product.imageUrl,title:product.name,...props}:{faces:model.faces,dimensions:model.dimensions,title:model.name,...props})));
 const flush=()=>{for(let guard=0;frames.size&&guard<10;guard++){const pending=[...frames.values()];frames.clear();now+=400;pending.forEach(fn=>fn(now));}};
 const click=label=>act(async()=>{const button=[...document.querySelectorAll("button")].find(node=>(node.getAttribute("aria-label")||node.textContent)===label);assert.ok(button,label);button.click();flush();});
 const dispatch=(image,type)=>{assert.ok(image);if(type==="load"){Object.defineProperty(image,"naturalWidth",{value:1600,configurable:true});Object.defineProperty(image,"naturalHeight",{value:1600,configurable:true});}image.dispatchEvent(new dom.window.Event(type));};
 const resize=async(width,height)=>{normal={width,height};for(let pass=0;pass<2;pass++)await act(async()=>{for(const observer of [...observers])observer.callback([...observer.targets].map(target=>({target,contentRect:layout(target)})));});};
 try{await run({render,click,dispatch,resize,observers,normal,flush});}
 finally{await act(async()=>root.unmount());assert.equal(observers.size,0,"every resize observer is detached");dom.window.close();for(const[key,value]of prior)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
}

test("actual wrapper reuses exactly two original sources across ten strips and keeps the central print continuous",async()=>environment(async({render,dispatch})=>{
 const ready=[];await render("Wrapper",{onReady:(face,value)=>ready.push([face,value])});
 const images=[...document.querySelectorAll("img")];assert.equal(images.length,10);
 assert.deepEqual([...new Set(images.map(image=>image.getAttribute("src")))].sort(),[model.faces.front.src,model.faces.back.src].sort());
 assert.equal(document.querySelectorAll(".product-inspect__wrapper-edge").length,2);assert.equal(document.querySelectorAll(".product-inspect__wrapper-end").length,2);
 for(const face of ["front","back"]){
  const rows=[...document.querySelectorAll(`[data-wrapper-face="${face}"]`)];assert.equal(rows.length,5);
  assert.equal(rows.filter(row=>row.getAttribute("aria-hidden")!=="true").length,1,"repeated strips are hidden from assistive reading");
  assert.match(rows[2].style.transform,/rotateX\(0deg\)/,"one flat center spans the printed body");
  assert.ok(parseFloat(rows[2].style.height)>332*.7);
 }
 await act(async()=>images.forEach(image=>dispatch(image,"load")));
 assert.equal(ready.length,10);assert.ok(ready.every(([,value])=>value));
 assert.ok(images.every(image=>image.style.getPropertyValue("--face-source-width")==="1600px"));
}));

test("fractional resize updates geometry and native-pixel projection without reloading or duplicating source callbacks",async()=>environment(async({render,dispatch,resize})=>{
 const ready=[];await render("Wrapper",{onReady:(...args)=>ready.push(args)});
 const originals=[...document.querySelectorAll("img")];await act(async()=>originals.forEach(image=>dispatch(image,"load")));
 await resize(225.55,416.27);
 const resized=[...document.querySelectorAll("img")];assert.equal(resized.length,originals.length);
 resized.forEach((image,index)=>assert.ok(image===originals[index],`resize preserves image node ${index}`));
 assert.equal(ready.length,10,"geometry changes do not fake image readiness events");
 const center=document.querySelectorAll('[data-wrapper-face="front"]')[2],photo=center.querySelector(".product-inspect__wrapper-photo"),image=center.querySelector("img");
 close(parseFloat(photo.style.height),416.27);
 const actual=image.style.transform.slice(9,-1).split(",").map(Number),expected=faceProjection(model.faces.front.quad,225.55,416.27,1600,1600);
 actual.forEach((n,i)=>close(n,expected[i]));
 const mesh=wrapperGeometry({width:225.55,height:416.27,depth:225.55*Math.min(.028,Math.max(.012,model.dimensions.depth/model.dimensions.width)),endDepth:.55});
 const overlap=parseFloat(center.style.height)-mesh.rows[2].length;
 assert.ok(overlap>=0&&overlap<=2,"raster-gap coverage stays below two pixels");
 close(parseFloat(center.style.marginTop),-mesh.rows[2].length/2-overlap/2);
 close(parseFloat(photo.style.top)+parseFloat(center.style.marginTop),mesh.rows[2].textureOffsetY-mesh.rows[2].length/2);
}));

for(const face of ["front","back"])test(`a failed ${face} strip disables the whole wrapper and keeps the opposite genuine photo`,async()=>environment(async({render,dispatch})=>{
 await render("Viewer");
 const failing=[...document.querySelectorAll(`[data-wrapper-face="${face}"] img`)],other=face==="front"?"back":"front";
 const successful=[...document.querySelectorAll(`[data-wrapper-face="${other}"] img`)];
 await act(async()=>{failing.forEach(image=>dispatch(image,"error"));successful.forEach(image=>dispatch(image,"load"));});
 assert.equal(document.querySelector(".product-inspect__stage").dataset.shape,"photo");
 assert.equal(document.querySelector(".product-inspect__wrapper"),null);
 assert.equal(document.querySelectorAll(".product-inspect__face").length,1);
 assert.equal(document.querySelector("img").getAttribute("src"),model.faces[other].src);
 assert.equal(document.querySelector('[aria-label="Wrapper faces"]'),null);
 assert.match(document.querySelector('.product-inspect__view[role="status"]').textContent,new RegExp(other==="front"?"Front photo":"Back photo"));
 assert.match(document.querySelector('.product-inspect__retry[role="status"]').textContent,/Some photos couldn’t load/);
}));

test("full-screen wrapper uses its new measured size, preserves sources and cleans up the additional observers",async()=>environment(async({render,click,observers})=>{
 await render("Viewer");const before=observers.size;
 await click("Full screen");
 const dialog=document.querySelector("dialog");assert.ok(dialog?.hasAttribute("open"));
 const rows=dialog.querySelectorAll('[data-wrapper-face="front"]'),center=rows[2];assert.equal(rows.length,5);
 close(parseFloat(center.querySelector(".product-inspect__wrapper-photo").style.height),498.55);
 assert.deepEqual([...new Set([...dialog.querySelectorAll("img")].map(image=>image.getAttribute("src")))].sort(),[model.faces.front.src,model.faces.back.src].sort());
 await click("Close full screen");assert.equal(document.querySelector("dialog"),null);assert.equal(observers.size,before);
 assert.equal(document.querySelectorAll(".product-inspect__wrapper-row").length,10);
}));
