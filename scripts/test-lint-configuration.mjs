import assert from "node:assert/strict";
import { ESLint } from "eslint";

const eslint = new ESLint();
const cases = [
  {
    name: "JSX component references count as used imports",
    code: 'import { Button } from "./ui"; export default function Page() { return <Button />; }',
    path: "src/__lint_contract__.jsx", expected: [],
  },
  {
    name: "JSX member references count as used imports",
    code: 'import * as UI from "./ui"; export default function Page() { return <UI.Button />; }',
    path: "src/__lint_contract__.jsx", expected: [],
  },
  {
    name: "genuinely unused imports are still errors",
    code: 'import { Button } from "./ui"; export default function Page() { return <div />; }',
    path: "src/__lint_contract__.jsx", expected: ["no-unused-vars"],
  },
  {
    name: "missing JSX components are errors",
    code: 'export default function Page() { return <MissingButton />; }',
    path: "src/__lint_contract__.jsx", expected: ["react/jsx-no-undef"],
  },
  {
    name: "conditional Hook calls remain errors",
    code: 'import { useState } from "react"; export default function Page({ ready }) { if (ready) useState(0); return <div />; }',
    path: "src/__lint_contract__.jsx", expected: ["react-hooks/rules-of-hooks"],
  },
  {
    name: "Node script globals are recognized",
    code: 'process.stdout.write(Buffer.from("test"));',
    path: "scripts/__lint_contract__.mjs", expected: [],
  },
  {
    name: "Node scripts receive real undefined-name checking",
    code: 'process.stdout.write(missingRuntimeValue);',
    path: "scripts/__lint_contract__.mjs", expected: ["no-undef"],
  },
  {
    name: "backend test modules receive recommended rules",
    code: 'const unusedValue = 1; process.stdout.write("test");',
    path: "backend/test/__lint_contract__.mjs", expected: ["no-unused-vars"],
  },
];

for (const scenario of cases) {
  const [result] = await eslint.lintText(scenario.code, { filePath: scenario.path });
  assert.deepEqual(result.messages.map(({ ruleId }) => ruleId).sort(), [...scenario.expected].sort(), scenario.name);
  assert.ok(result.messages.every(({ severity }) => severity === 2), "Regression diagnostics must stay errors.");
  console.log(`PASS ${scenario.name}`);
}
console.log(`Lint configuration passed (${cases.length} scenarios; no blanket rule suppression).`);
