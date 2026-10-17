const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const espree = require('espree');
const { transformSync } = require('esbuild');
const { chromium } = require('@playwright/test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const ast = espree.parse(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, range: true });
const functions = new Map();
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'FunctionDeclaration') functions.set(node.id.name, node);
  Object.values(node).forEach(value => Array.isArray(value) ? value.forEach(walk) : value?.type && walk(value));
}
walk(ast);
const functionSource = name => source.slice(...functions.get(name).range);
// The real keyed wrapper and the real two state declarations are mounted with a
// tiny test view, avoiding unrelated product helpers while exercising React's
// actual render/commit lifecycle. The header hook is mounted in full.
const detail = functions.get('VaultItemDetailContent');
const stateDeclarations = detail.body.body.slice(0, 2).map(node => source.slice(...node.range)).join('\n');
assert.ok(stateDeclarations.includes('loadGradeAssistDraft(item || {})'));
const fixtureSource = [functionSource('useAutoHideHeader'), functionSource('gradeAssistRecordKey'), functionSource('VaultItemDetail'),
  `function VaultItemDetailContent({ item }) {
    ${stateDeclarations}
    return React.createElement('section', null,
      React.createElement('output', { id: 'grade-value' }, gradeAssistDraft.notes + '|' + gradeAssistMessage),
      React.createElement('button', { id: 'edit-grade', onClick: () => { setGradeAssistDraft({notes:'unsaved draft'}); setGradeAssistMessage('draft message'); } }, 'Edit'));
  }`,
].join('\n');
const compiled = transformSync(fixtureSource, { loader: 'jsx', jsx: 'transform' }).code;
const base = new URL(process.env.APP_URL || 'http://127.0.0.1:5217/');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname));
const output = process.env.QA_OUTPUT_DIR ? path.resolve(root, process.env.QA_OUTPUT_DIR) : path.join(root, 'artifacts/qa/release-readiness/app-react-lifecycle');
fs.mkdirSync(output, {recursive:true});

(async () => {
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const strict of [false, true]) {
      const context = await browser.newContext();
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== base.origin) return route.abort();
        if (url.pathname === '/__qa/app-react-lifecycle') return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><div id="fixture"></div></body></html>'});
        return route.continue();
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(new URL('/__qa/app-react-lifecycle', base).href);
      const result = await page.evaluate(async ({compiled,strict}) => {
        const main = await (await fetch('/src/main.jsx')).text();
        const imports = [...main.matchAll(/from\s+["']([^"']+)["']/g)].map(m=>m[1]);
        const find = file => imports.find(value=>new URL(value,location.href).pathname.endsWith('/'+file));
        const react = await import(find('react.js'));
        const React = react.default || react;
        const dom = await import(find('react-dom_client.js'));
        const { createRoot } = dom.default || dom;
        const { useState, useRef, useEffect, useCallback, act } = React;
        window.IS_REACT_ACT_ENVIRONMENT = true;
        const frames = new Map();
        let frameId = 0, cancelled = 0, y = 0;
        Object.defineProperty(window,'scrollY',{configurable:true,get:()=>y});
        window.requestAnimationFrame = fn => { const id=++frameId;frames.set(id,fn);return id; };
        window.cancelAnimationFrame = id => { if(frames.delete(id)) cancelled++; };
        const {useAutoHideHeader,VaultItemDetail} = new Function('React','useState','useRef','useEffect','useCallback','loadGradeAssistDraft', compiled+';return {useAutoHideHeader,VaultItemDetail};')(
          React,useState,useRef,useEffect,useCallback,item=>({notes:item.notes}));
        let change;
        function Probe() {
          const [props,setProps] = useState({disabled:false,resetKey:'a',item:{id:'A',notes:'saved A'}});
          useEffect(()=>{change=patch=>setProps(current=>({...current,...patch}));},[]);
          const header=useAutoHideHeader(props);
          return React.createElement(React.Fragment,null,
            React.createElement('output',{id:'header-mode'},header.headerMode),
            React.createElement('div',{className:'header'},React.createElement('button',{id:'focus-header'},'Header action')),
            React.createElement(VaultItemDetail,{item:props.item}));
        }
        const root=createRoot(document.getElementById('fixture'));
        const checks=[];
        const check=(name,condition)=>{if(!condition)throw new Error(name);checks.push(name);};
        const mode=()=>document.getElementById('header-mode').textContent;
        const grade=()=>document.getElementById('grade-value').textContent;
        const scroll=async next=>{await act(async()=>{y=next;window.dispatchEvent(new Event('scroll'));const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());});};
        await act(async()=>root.render(strict?React.createElement(React.StrictMode,null,React.createElement(Probe)):React.createElement(Probe)));
        check('initial header is full',mode()==='full');
        await scroll(180);check('downward threshold compacts header',mode()==='compact');
        await act(async()=>change({resetKey:'b'}));check('route change immediately reveals header',mode()==='full');
        await scroll(360);check('new route can compact',mode()==='compact');
        await act(async()=>change({disabled:true}));check('dialog disables collapsing',mode()==='full');
        await act(async()=>change({disabled:false}));check('reenabling does not restore stale compact state',mode()==='full');
        await scroll(540);check('reenabled scroll compacts',mode()==='compact');
        await act(async()=>document.getElementById('focus-header').focus());check('keyboard focus reveals header',mode()==='full');
        check('first record loads saved notes',grade()==='saved A|');
        await act(async()=>document.getElementById('edit-grade').click());check('editing keeps local draft/message',grade()==='unsaved draft|draft message');
        await act(async()=>change({item:{id:'A',notes:'new server value'}}));check('same-record rerender retains unsaved draft',grade()==='unsaved draft|draft message');
        await act(async()=>change({item:{id:'B',notes:'saved B'}}));check('different record clears previous draft/message',grade()==='saved B|');
        await act(async()=>{y=800;window.dispatchEvent(new Event('scroll'));});
        check('scroll frame scheduled',frames.size===1);
        await act(async()=>root.unmount());check('unmount cancels pending scroll frame',frames.size===0&&cancelled>0);
        return {strict,checks,passed:true};
      },{compiled,strict});
      assert.deepEqual(errors,[]);
      results.push(result);
      console.log(`PASS ${strict?'StrictMode':'normal'}: ${result.checks.length} actual React lifecycle checks`);
      await context.close();
    }
  } finally {await browser.close();}
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
