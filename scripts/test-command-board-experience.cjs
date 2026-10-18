const assert = require("node:assert/strict");
const vm = require("node:vm");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { buildSync } = require("esbuild");

const compiled = buildSync({
  stdin: { contents: 'export {CommandBoardV4,CommandBoardRouteStrip} from "./src/components/command-system/CommandBoardV4.jsx"; export {ExperiencePresentationContext} from "./src/utils/experiencePresentationContext.js";', resolveDir: process.cwd() },
  bundle: true, platform: "node", format: "cjs", jsx: "automatic", packages: "external", write: false,
}).outputFiles[0].text;
const compiledModule = { exports: {} };
vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, require });
const { CommandBoardV4, CommandBoardRouteStrip, ExperiencePresentationContext } = compiledModule.exports;
const h = React.createElement;
const routeKeys = ["vault", "scout", "exchange", "spark", "kidsProgram", "parentCenter", "tidepool", "community", "future-core-route"];
const routes = routeKeys.map(key => ({ key, label: key, onClick: () => {} }));
const options = [
  { name: "standalone fallback preserves legacy chrome", value: null, business: "Business", family: true, community: true },
  { name: "collector defaults keep core routes and occasional exchange", value: {}, business: null, family: false, community: false },
  { name: "admin retains optional navigation", value: { showAdminTools: true }, business: "Business", family: true, community: true },
  { name: "Store labels business tools without enabling optional extras", value: { showBusinessTools: true, isStore: true }, business: "Store", family: false, community: false },
  { name: "explicit family retains only family extras", value: { showFamilyTools: true }, business: null, family: true, community: false },
  { name: "explicit community retains only community extras", value: { showCommunityTools: true }, business: null, family: false, community: true },
];
const renderedRouteKeys = html => [...html.matchAll(/data-command-key="([^"]+)"/g)].map(match => match[1]);
for (const item of options) {
  const board = h(CommandBoardV4, { title: "Synthetic page", routes });
  const html = renderToStaticMarkup(h(ExperiencePresentationContext.Provider, { value: item.value }, board));
  assert.equal((html.match(/href="\/business"/g) || []).length, item.business ? 2 : 0, "Desktop and mobile business navigation agree");
  if (item.business) assert.equal((html.match(new RegExp(`<b>${item.business}</b>`, "g")) || []).length, 2);
  assert.equal(html.includes("<b>Family guard</b>"), item.family);
  assert.equal(html.includes("<b>Privacy &amp; safety</b>"), !item.family);
  const expected = routeKeys.filter(key => !["spark", "kidsProgram", "parentCenter"].includes(key) || item.family).filter(key => !["tidepool", "community"].includes(key) || item.community);
  assert.deepEqual(renderedRouteKeys(html), expected, "Only exact known optional keys are filtered; order and core routes stay unchanged");
  const strip = renderToStaticMarkup(h(ExperiencePresentationContext.Provider, { value: item.value }, h(CommandBoardRouteStrip, { routes })));
  assert.deepEqual(renderedRouteKeys(strip), expected, "Standalone route strips use the same presentation preferences");
  console.log(`PASS ${item.name}`);
}
console.log(`Command board presentation: ${options.length}/${options.length} rendered checks passed.`);
