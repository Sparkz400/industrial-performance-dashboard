import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(new URL('../server/package.json', import.meta.url));
const { default: bcrypt } = await import(pathToFileURL(require.resolve('bcrypt')));
const { default: nodemailer } = await import(pathToFileURL(require.resolve('nodemailer')));
const { default: puppeteer } = await import(pathToFileURL(require.resolve('puppeteer')));
await import(pathToFileURL(require.resolve('node-opcua')));
await import(pathToFileURL(require.resolve('cron-parser')));
const database = new DatabaseSync(':memory:');
assert.equal(database.prepare('SELECT 1 AS ok').get().ok, 1);
database.close();
assert.ok(await bcrypt.compare('runtime-smoke', await bcrypt.hash('runtime-smoke', 4)));

// Compile a message in memory; no SMTP connection or external recipient.
const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
const message = await transport.sendMail({ from: 'test@example.invalid', to: 'test@example.invalid', subject: 'Report smoke', text: 'Offline verification' });
assert.match(message.message.toString(), /Offline verification/);

process.env.OTEL_ENABLED = 'true';
process.env.OTEL_METRICS_EXPORTER = 'none';
process.env.OTEL_LOGS_EXPORTER = 'none';
const tracing = await import('../server/dist/src/observability/tracing.js');
tracing.initTracing();
await tracing.shutdownTracing();

const browser = await puppeteer.launch({ headless: true, args: process.platform === 'linux' ? ['--no-sandbox', '--disable-setuid-sandbox'] : [] });
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><h1>Report smoke</h1>', { waitUntil: 'load' });
  const pdf = await page.pdf({ format: 'A4' });
  assert.equal(Buffer.from(pdf).subarray(0, 4).toString(), '%PDF');
  assert.ok(pdf.length > 1000);
} finally {
  await browser.close();
}
console.log('PASS: SQLite, bcrypt, OPC UA, scheduler, offline email, tracing startup and Chromium PDF');
