import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const directory = await mkdtemp(join(tmpdir(), "pd-async-spool-"));
try {
  const preload = join(directory, "slow-disk.mjs");
  await writeFile(
    preload,
    `
import { isMainThread } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
if (!isMainThread) {
  const prepare = DatabaseSync.prototype.prepare;
  DatabaseSync.prototype.prepare = function(sql) {
    const statement = prepare.call(this, sql);
    if (sql.startsWith('INSERT OR IGNORE INTO measurements')) {
      const run = statement.run;
      statement.run = function(...args) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,300);
        return run.apply(this,args);
      };
    }
    return statement;
  };
}`,
  );
  const childFile = join(directory, "check.mjs");
  const moduleUrl = pathToFileURL(
    resolve("server/dist/src/queue/asyncMeasurementSpool.js"),
  ).href;
  await writeFile(
    childFile,
    `
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { AsyncMeasurementSpool } from ${JSON.stringify(moduleUrl)};
const spool = new AsyncMeasurementSpool(${JSON.stringify(join(directory, "spool.sqlite"))}, {maxEntries:100,minFreeBytes:0});
const server = createServer((req,res)=>res.end('responsive'));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try {
  await spool.health();
  let accepted = false;
  const durable = Promise.all(Array.from({length:10},(_,i)=>spool.enqueue({key:'Count',label:'Count',value:i,timestamp:new Date()}))).then(()=>{accepted=true;});
  await delay(100);
  assert.equal(accepted,false,'Slow disk must not be acknowledged early');
  const response=await fetch('http://127.0.0.1:'+server.address().port,{signal:AbortSignal.timeout(1000)});
  assert.equal(await response.text(),'responsive');
  assert.equal(accepted,false,'HTTP must respond while durable storage is blocked');
  await durable;
  assert.equal((await spool.health()).pendingMeasurements,10);
} finally {
  await spool.close();
  await new Promise(resolve=>server.close(resolve));
}
console.log('PASS: HTTP responds during 3s of synchronous spool writes; acceptance waits for durable commit');
`,
  );
  const code = await new Promise((done, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", pathToFileURL(preload).href, childFile],
      { windowsHide: true, stdio: "inherit", timeout: 20000 },
    );
    child.once("error", reject);
    child.once("exit", done);
  });
  assert.equal(code, 0, "Slow disk responsiveness regression failed");
} finally {
  await rm(directory, { recursive: true, force: true });
}
