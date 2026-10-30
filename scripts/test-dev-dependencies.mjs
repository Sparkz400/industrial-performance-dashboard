import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import './test-opcua-overflow.mjs';

const require = createRequire(import.meta.url);
// Exercise the legacy Drizzle loader against its scoped esbuild security override.
const loader = require('@esbuild-kit/core-utils');
const source = 'const { value }: { value: number } = { value: 42 }; module.exports = value;';
for (const result of [loader.transformSync(source, 'fixture.ts'), await loader.transform(source, 'fixture.ts', { format: 'cjs' })]) {
  const context = { module: { exports: undefined } };
  runInNewContext(result.code, context);
  assert.equal(context.module.exports, 42);
}
console.log('PASS: Drizzle sync/async TypeScript transforms');
