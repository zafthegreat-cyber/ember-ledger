import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { prepareNativeOcrModel } from "./native-ocr-assets.mjs";

test("native output uses an unpacked OCR model without changing the compressed web source", async () => {
  const root=await mkdtemp(resolve(tmpdir(),"code3-native-ocr-"));
  const directory=resolve(root,"ocr/tesseract-7.0.0/lang");
  await mkdir(directory,{recursive:true});
  const original=await readFile("public/ocr/tesseract-7.0.0/lang/eng.traineddata.gz");
  const model=Buffer.from("synthetic OCR model bytes");
  await writeFile(resolve(directory,"eng.traineddata.gz"),gzipSync(model));
  assert.deepEqual(prepareNativeOcrModel(root),{model:"eng.traineddata",bytes:model.length,gzip:false});
  assert.deepEqual(await readFile(resolve(directory,"eng.traineddata")),model);
  await assert.rejects(readFile(resolve(directory,"eng.traineddata.gz")),{code:"ENOENT"});
  assert.deepEqual(await readFile("public/ocr/tesseract-7.0.0/lang/eng.traineddata.gz"),original);
});

test("compiled web and native screenshot readers request the correct model format", async () => {
  for (const native of [false,true]) {
    const result=await build({entryPoints:["src/utils/scoutScreenshotOcr.mjs"],bundle:true,platform:"node",format:"cjs",define:{"import.meta.env":JSON.stringify({VITE_NATIVE_BUILD:String(native)})},write:false,logLevel:"silent"});
    const module={exports:{}};
    runInNewContext(result.outputFiles[0].text,{module,exports:module.exports});
    assert.equal(module.exports.SCOUT_SCREENSHOT_MODEL_GZIP,!native);
  }
});

test("the actual controller forwards native model selection and preserves web OCR defaults", async () => {
  const source=await readFile("src/workers/scoutScreenshotOcr.worker.js","utf8");
  for (const gzip of [undefined,true,false]) {
    let options; const messages=[];
    const self={location:{href:"https://localhost/ocr/scout-screenshot-v1.worker.js"},postMessage:value=>messages.push(value),close(){}};
    const Tesseract={async createWorker(language,oem,value){assert.equal(language,"eng");assert.equal(oem,1);options=value;return {async setParameters(){},async recognize(){return {data:{text:"synthetic text",confidence:90}};},async terminate(){}};}};
    runInNewContext(source,{self,URL,Uint8Array,importScripts(){self.Tesseract=Tesseract;}});
    await self.onmessage({data:{type:"recognize",image:new Uint8Array([1]),gzip}});
    assert.equal(options.gzip,gzip!==false);
    assert.equal(options.langPath,"https://localhost/ocr/tesseract-7.0.0/lang");
    assert.equal(messages[0].type,"result");
  }
});
