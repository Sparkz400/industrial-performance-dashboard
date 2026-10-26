import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';

const received = [];
const collector = createServer((request, response) => {
  const chunks = [];
  request.on('data', chunk => chunks.push(chunk));
  request.on('end', () => {
    received.push({ path: request.url, length: Buffer.concat(chunks).length });
    response.writeHead(200, { 'content-type': 'application/x-protobuf' });
    response.end();
  });
});
collector.listen(0, '127.0.0.1');
await once(collector, 'listening');
process.env.OTEL_ENABLED = 'true';
process.env.OTEL_EXPORTER_OTLP_ENDPOINT = `http://127.0.0.1:${collector.address().port}`;
const { initTracing, shutdownTracing } = await import('../server/dist/src/observability/tracing.js');
try {
  initTracing();
  const { trace } = await import('@opentelemetry/api');
  trace.getTracer('p0-compatibility').startSpan('owned-test-span').end();
  await shutdownTracing();
  assert.ok(received.some(item => item.path === '/v1/traces' && item.length > 0));
  console.log('PASS: aligned OpenTelemetry dependencies export a real span to an owned loopback collector');
} finally {
  await new Promise((resolve, reject) => collector.close(error => error ? reject(error) : resolve()));
}
