import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const actionsRequire = createRequire(require.resolve('@storybook/addon-actions'));
const uuid = actionsRequire('uuid');
assert.match(uuid.v4(), /^[0-9a-f-]{36}$/);
assert.throws(() => uuid.v5('fixture', uuid.v5.DNS, new Uint8Array(15)), RangeError);

// Exercise the legacy Drizzle loader against its scoped esbuild security override.
const loader = require('@esbuild-kit/core-utils');
const source = 'const { value }: { value: number } = { value: 42 }; module.exports = value;';
for (const result of [loader.transformSync(source, 'fixture.ts'), await loader.transform(source, 'fixture.ts', { format: 'cjs' })]) {
  const context = { module: { exports: undefined } };
  runInNewContext(result.code, context);
  assert.equal(context.module.exports, 42);
}
console.log('PASS: Storybook UUID buffer validation and Drizzle sync/async TypeScript transforms');
