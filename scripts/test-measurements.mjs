import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
dotenv.config({ path: 'server/.env', quiet: true });
const directory = await mkdtemp(join(tmpdir(), 'dashboard-integration-'));
const { default: config } = await import('../server/dist/src/config/config.js');
config.OPCUA_SPOOL_PATH = join(directory, 'spool.sqlite');
config.OPCUA_PKI_DIR = join(directory, 'pki');
const { default: manager } = await import('../server/dist/src/database/dbConnection.js');
const { OpcuaQueueWorker } = await import('../server/dist/src/queue/opcuaQueueWorker.js');
const { oeeCalculationService } = await import('../server/dist/src/services/oeeCalculationService.js');
const { default: certificates } = await import('../server/dist/src/opc-ua/services/certificateManager.js');
let worker = new OpcuaQueueWorker();
let machineId;
try {
  for (const filename of ['../private_key.pem', '..\\private_key.pem', '/tmp/test.pem', 'C:\\test.pem']) {
    await assert.rejects(certificates.acceptRejectedCertificate(filename), /Invalid certificate filename/);
  }
  const endpoint = `opc.tcp://test-${randomUUID()}:4841`;
  const created = await manager.pool.query("INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES ('Persistence regression',$1,'localhost',false) RETURNING id", [endpoint]);
  machineId = created.rows[0].id;
  const timestamp = new Date('2026-01-01T08:00:00Z');
  const sample = { key: 'Running', label: 'Running', timestamp, value: true, statusCode: 'Good', dataType: 'Boolean', machineId };
  worker.enqueue(sample);
  worker.enqueue({ ...sample, key: 'Message', value: 'Fault 42', dataType: 'String' });
  worker.enqueue({ ...sample, key: 'BadValue', value: 123, statusCode: 'BadNoCommunication' });
  worker.enqueue({ ...sample, key: 'Counter', value: 16777217, dataType: 'UInt32' });
  await worker.stop();
  worker = new OpcuaQueueWorker();
  await worker.processBatch();
  const result = await manager.pool.query('SELECT * FROM opcua_data WHERE machine_id=$1 ORDER BY node_key', [machineId]);
  assert.equal(result.rows.length, 4);
  assert.equal(result.rows.find(row => row.node_key === 'Running').raw_value, true);
  assert.equal(result.rows.find(row => row.node_key === 'Running').value, 1);
  assert.equal(result.rows.find(row => row.node_key === 'Message').raw_value, 'Fault 42');
  assert.equal(result.rows.find(row => row.node_key === 'BadValue').value, null);
  assert.equal(result.rows.find(row => row.node_key === 'Counter').value, 16777217);
  const replay = result.rows[0];
  await manager.pool.query('INSERT INTO opcua_data(node_key,timestamp,event_id,machine_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [replay.node_key, replay.timestamp, replay.event_id, machineId]);
  assert.equal(Number((await manager.pool.query('SELECT count(*) FROM opcua_data WHERE machine_id=$1', [machineId])).rows[0].count), 4);
  await manager.pool.query("INSERT INTO oee_config(machine_id,running_mode_values,idle_mode_values) VALUES ($1,'[1]','[0]')", [machineId]);
  await manager.pool.query("INSERT INTO opcua_data(node_key,timestamp,value,machine_id) VALUES('OperationMode','2026-01-01T07:00:00Z',1,$1)", [machineId]);
  const availability = await oeeCalculationService.calculateAvailability(machineId, timestamp, new Date('2026-01-01T09:00:00Z'));
  assert.equal(availability.runningTimeMinutes, 60);
  assert.equal(availability.unknownTimeMinutes, 0);
  await certificates.ensureInitialized();
  assert.equal(certificates.isInitialized, true);
  const loaded = await certificates.loadCertificates();
  assert.ok(loaded.certificate.length > 0 && loaded.privateKey.length > 0);
  const trusted = await certificates.trustCertificate(loaded.certificate, '../../outside');
  assert.equal(dirname(trusted), certificates.trustedDir);
  console.log('PASS: PostgreSQL scalar/quality persistence, counter precision, replay deduplication, OEE boundaries and fresh certificate initialization');
} finally {
  await worker.stop();
  await certificates.certManager?.dispose();
  if (machineId) {
    await manager.pool.query('DELETE FROM opcua_data WHERE machine_id=$1', [machineId]);
    await manager.pool.query('DELETE FROM machines WHERE id=$1', [machineId]);
  }
  await manager.end();
  await rm(directory, { recursive: true, force: true });
}
