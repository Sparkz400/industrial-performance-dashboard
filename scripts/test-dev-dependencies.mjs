import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const commitlint = fileURLToPath(new URL('../node_modules/@commitlint/cli/cli.js', import.meta.url));
for (const [message, status] of [['fix: preserve measurements', 0], ['not a conventional commit', 1]]) {
  const result = spawnSync(process.execPath, [commitlint], { input: message, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status === 0, status === 0, result.stderr + result.stdout);
}
console.log('PASS: commitlint accepts valid messages and rejects invalid messages with the installed config');

// Exercise the hook in an owned repository so no real index or unstaged work is touched.
const directory = await mkdtemp(join(tmpdir(), 'pd-git-hooks-'));
try {
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', windowsHide: true });
  git('init', '--quiet');
  git('config', 'user.name', 'Owned hook fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'core.autocrlf', 'false');
  const original = 'before\n' + '\n'.repeat(10) + 'original tail\n';
  await writeFile(join(directory, 'staged.txt'), original);
  await writeFile(join(directory, 'other.txt'), 'original\n');
  await writeFile(join(directory, 'task.mjs'), `
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
assert.equal(readFileSync('other.txt', 'utf8'), 'original\\n');
const text = readFileSync('staged.txt', 'utf8');
assert.ok(!text.includes('private tail'));
writeFileSync('staged.txt', text.replace('staged', 'formatted'));
`);
  await writeFile(join(directory, 'lint-staged.config.mjs'), "export default { '*.txt': 'node task.mjs' };\n");
  git('add', '.');
  git('-c', 'core.hooksPath=NUL', 'commit', '--quiet', '-m', 'fixture');
  await writeFile(join(directory, 'staged.txt'), original.replace('before', 'staged'));
  git('add', 'staged.txt');
  await writeFile(join(directory, 'staged.txt'), original.replace('before', 'staged').replace('original tail', 'private tail'));
  await writeFile(join(directory, 'other.txt'), 'private unrelated work\n');
  const hook = (await readFile(new URL('../.husky/pre-commit', import.meta.url), 'utf8')).trim().split(/\s+/);
  assert.deepEqual(hook.slice(0, 2), ['npx', 'lint-staged']);
  const cli = fileURLToPath(new URL('../node_modules/lint-staged/bin/lint-staged.js', import.meta.url));
  execFileSync(process.execPath, [cli, ...hook.slice(2)], { cwd: directory, stdio: 'pipe', windowsHide: true });
  assert.equal(git('show', ':staged.txt'), original.replace('before', 'formatted'));
  assert.equal(git('diff', '--cached', '--name-only').trim(), 'staged.txt');
  assert.equal(await readFile(join(directory, 'staged.txt'), 'utf8'), original.replace('before', 'formatted').replace('original tail', 'private tail'));
  assert.equal(await readFile(join(directory, 'other.txt'), 'utf8'), 'private unrelated work\n');
  console.log('PASS: the pre-commit hook preserves partial and unrelated unstaged changes');
} finally {
  await rm(directory, { recursive: true, force: true });
}
