import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} from "node:worker_threads";
import type {
  MeasurementSpool,
  OpcuaDataItem,
  SpoolEntry,
} from "./measurementSpool.js";

type Method = keyof MeasurementSpool;
type Request = { id: number; method: Method; args: unknown[] };
type Reply = { id: number; value?: unknown; error?: string };

if (!isMainThread && workerData?.measurementSpool === true) {
  // Node 24 can run the source in tests as well as the compiled installation.
  const extension = import.meta.url.endsWith(".ts") ? "ts" : "js";
  const { MeasurementSpool } = (await import(
    new URL(`./measurementSpool.${extension}`, import.meta.url).href
  )) as typeof import("./measurementSpool.js");
  const spool = new MeasurementSpool(workerData.filename, workerData.limits);
  parentPort!.on("message", ({ id, method, args }: Request) => {
    try {
      const value = Reflect.apply(spool[method], spool, args);
      parentPort!.postMessage({ id, value });
      if (method === "close") parentPort!.close();
    } catch (error) {
      parentPort!.postMessage({
        id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

/** Disk flushes stay off the HTTP thread; enqueue resolves only after FULL commit. */
export class AsyncMeasurementSpool {
  private worker: Worker;
  private nextId = 0;
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private failure?: Error;
  private closing?: Promise<void>;
  private queuedMeasurements = 0;
  private batch?: {
    items: OpcuaDataItem[];
    promise: Promise<void>;
    resolve: () => void;
    reject: (error: Error) => void;
  };
  private flushTimer?: NodeJS.Immediate;

  constructor(
    filename: string,
    limits: { maxEntries: number; minFreeBytes: number },
  ) {
    // Inline bootstrap also supports parents launched with --input-type=module.
    this.worker = new Worker(`import(${JSON.stringify(import.meta.url)})`, {
      eval: true,
      workerData: { measurementSpool: true, filename, limits },
    });
    this.worker.on("message", ({ id, value, error }: Reply) => {
      const request = this.pending.get(id);
      this.pending.delete(id);
      if (error !== undefined) request?.reject(new Error(error));
      else request?.resolve(value);
    });
    this.worker.on("error", (error) =>
      this.fail(error instanceof Error ? error : new Error(String(error))),
    );
    this.worker.on("exit", (code) => {
      if (code !== 0 || this.pending.size || !this.closing)
        this.fail(new Error(`Measurement spool thread exited (${code})`));
    });
  }

  private fail(error: Error) {
    this.failure ??= error;
    clearImmediate(this.flushTimer);
    this.batch?.reject(this.failure);
    this.batch = undefined;
    for (const request of this.pending.values()) request.reject(this.failure);
    this.pending.clear();
  }

  private call<M extends Method>(
    method: M,
    ...args: Parameters<MeasurementSpool[M]>
  ): Promise<ReturnType<MeasurementSpool[M]>> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.closing)
      return Promise.reject(new Error("Measurement spool is closed"));
    if (this.pending.size >= 1000 && method !== "close")
      return Promise.reject(
        new Error("Measurement spool request capacity reached"),
      );
    if (method !== "enqueueBatch") this.flush();
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      try {
        this.worker.postMessage({ id, method, args });
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  private flush() {
    clearImmediate(this.flushTimer);
    const batch = this.batch;
    if (!batch) return;
    this.batch = undefined;
    void this.call("enqueueBatch", batch.items).then(
      batch.resolve,
      batch.reject,
    );
  }

  async enqueue(data: OpcuaDataItem): Promise<void> {
    if (this.failure) throw this.failure;
    if (this.closing) throw new Error("Measurement spool is closed");
    // A slow/full disk must stop acquisition, never grow an unbounded RAM queue.
    if (this.queuedMeasurements >= 1000)
      throw new Error(
        "Measurement spool backlog capacity reached; collection must stop",
      );
    const item = structuredClone(data);
    item.receivedAt ??= new Date();
    if (!this.batch) {
      let resolve!: () => void, reject!: (error: Error) => void;
      const promise = new Promise<void>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      this.batch = { items: [], promise, resolve, reject };
      this.flushTimer = setImmediate(() => this.flush());
    }
    const batch = this.batch;
    batch.items.push(item);
    this.queuedMeasurements++;
    if (batch.items.length >= 100) this.flush();
    try {
      await batch.promise;
    } finally {
      this.queuedMeasurements--;
    }
  }

  peek(limit: number) {
    return this.call("peek", limit);
  }
  health() {
    return this.call("health");
  }
  machineHealth(machineId: number) {
    return this.call("machineHealth", machineId);
  }
  quarantine(entry: SpoolEntry, reason: string) {
    return this.call("quarantine", entry, reason);
  }
  quarantined(limit: number) {
    return this.call("quarantined", limit);
  }
  requeueQuarantined() {
    return this.call("requeueQuarantined");
  }
  acknowledge(entries: SpoolEntry[]) {
    return this.call("acknowledge", entries);
  }

  close(): Promise<void> {
    if (!this.closing) {
      const closed = this.call("close");
      this.closing = closed.finally(async () => {
        await this.worker.terminate();
      });
    }
    return this.closing;
  }
}
