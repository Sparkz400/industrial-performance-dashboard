import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const client = fileURLToPath(new URL("../client/", import.meta.url));
const require = createRequire(
  new URL("../client/package.json", import.meta.url),
);
const { ESLint } = require("eslint");
const ts = require("typescript");
const lint = new ESLint({ cwd: client });
const cases = [
  [
    "missing key",
    "@eslint-react/no-missing-key",
    "export const View = () => [1, 2].map(n => <div>{n}</div>);",
  ],
  [
    "component name",
    "@eslint-react/no-missing-component-display-name",
    "import React from 'react'; export const View = React.memo(() => <div />);",
  ],
  [
    "comment text",
    "@eslint-react/jsx-no-comment-textnodes",
    "export const View = () => <div>// comment\n</div>;",
  ],
  [
    "children prop",
    "@eslint-react/jsx-no-children-prop",
    "export const View = () => <div children='text' />;",
  ],
  [
    "unsafe new tab",
    "@eslint-react/dom-no-unsafe-target-blank",
    "export const View = () => <a href='https://example.org' target='_blank'>link</a>;",
  ],
  [
    "HTML with children",
    "@eslint-react/dom-no-dangerously-set-innerhtml-with-children",
    "export const View = () => <div dangerouslySetInnerHTML={{__html: 'text'}}>child</div>;",
  ],
  [
    "unknown property",
    "@eslint-react/dom-no-unknown-property",
    "export const View = () => <div class='invalid' />;",
  ],
  [
    "findDOMNode",
    "@eslint-react/dom-no-find-dom-node",
    "import ReactDOM from 'react-dom'; export const find = () => ReactDOM.findDOMNode(null);",
  ],
  [
    "legacy render",
    "@eslint-react/dom-no-render",
    "import ReactDOM from 'react-dom'; ReactDOM.render(<div />, document.body);",
  ],
  [
    "render result",
    "@eslint-react/dom-no-render-return-value",
    "import ReactDOM from 'react-dom'; export const view = ReactDOM.render(<div />, document.body);",
  ],
  [
    "legacy hydrate",
    "@eslint-react/dom-no-hydrate",
    "import ReactDOM from 'react-dom'; ReactDOM.hydrate(<div />, document.body);",
  ],
  [
    "deprecated lifecycle",
    "@eslint-react/no-component-will-mount",
    "import React from 'react'; export class View extends React.Component { componentWillMount() {} render() { return null; } }",
  ],
  [
    "state mutation",
    "@eslint-react/no-direct-mutation-state",
    "import React from 'react'; export class View extends React.Component { update() { this.state = {}; } render() { return null; } }",
  ],
  [
    "unescaped text",
    "no-restricted-syntax",
    "export const View = () => <div>can't</div>;",
  ],
  [
    "conditional hook",
    "react-hooks/rules-of-hooks",
    "import { useState } from 'react'; export function View({enabled}) { if (enabled) useState(0); return null; }",
  ],
  [
    "missing hook dependency",
    "react-hooks/exhaustive-deps",
    "import { useEffect } from 'react'; export function View({value}) { useEffect(() => { document.title = value; }, []); return null; }",
  ],
  [
    "object injection",
    "security/detect-object-injection",
    "export function read(object, key) { return object[key]; }",
  ],
  [
    "dynamic regexp",
    "security/detect-non-literal-regexp",
    "export function match(pattern) { return new RegExp(pattern); }",
  ],
  [
    "unsafe regexp",
    "security/detect-unsafe-regex",
    "export const pattern = /(a+)+$/;",
  ],
  [
    "JSDoc parameter",
    "jsdoc/check-param-names",
    "/** @param wrong */\nexport function read(value) { return value; }",
  ],
];
for (const [name, rule, source] of cases) {
  const [result] = await lint.lintText(source, {
    filePath: "src/lint-policy-fixture.tsx",
  });
  assert.equal(
    result.fatalErrorCount,
    0,
    `${name}: ${JSON.stringify(result.messages)}`,
  );
  assert(
    result.messages.some((message) => message.ruleId === rule),
    `${name}: ${JSON.stringify(result.messages)}`,
  );
}
const [valid] = await lint.lintText(
  "export const View = () => <a href='https://example.org' target='_blank' rel='noopener noreferrer'>can&apos;t</a>;",
  { filePath: "src/lint-policy-fixture.tsx" },
);
assert.equal(valid.errorCount, 0, JSON.stringify(valid.messages));

// TypeScript owns these former React lint checks for the project's TS/TSX sources.
const directory = await mkdtemp(join(client, ".lint-policy-"));
try {
  const typed = [
    [
      "duplicate-prop",
      17001,
      "export const View = () => <div id='a' id='b' />;",
    ],
    [
      "undefined-component",
      2304,
      "export const View = () => <MissingComponent />;",
    ],
    ["string-ref", 2322, "export const View = () => <div ref='legacy' />;"],
    [
      "is-mounted",
      2339,
      "export class View extends React.Component { check() { return this.isMounted(); } render() { return null; } }",
    ],
    [
      "render-return",
      2416,
      "export class View extends React.Component { render() {} }",
    ],
  ];
  for (const [name, , source] of typed) {
    await writeFile(
      join(directory, `${name}.tsx`),
      `import React from 'react';\n${source}\n`,
    );
  }
  const program = ts.createProgram(
    typed.map(([name]) => join(directory, `${name}.tsx`)),
    {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      esModuleInterop: true,
    },
  );
  const diagnostics = ts.getPreEmitDiagnostics(program);
  for (const [name, code] of typed) {
    assert(
      diagnostics.some(
        (d) => d.file?.fileName.endsWith(`${name}.tsx`) && d.code === code,
      ),
      `${name}: ${ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCurrentDirectory: () => client,
        getCanonicalFileName: (path) => path,
        getNewLine: () => "\n",
      })}`,
    );
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
console.log(
  `PASS: ${cases.length} lint rejection fixtures, safe JSX and five TypeScript replacements`,
);
