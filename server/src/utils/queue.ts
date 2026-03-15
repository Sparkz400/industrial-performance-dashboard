import config from "../config/config.js";

const MAX_QUEUE_SIZE: number = config.MAX_QUEUE_SIZE;

export class AsyncQueue<T = any> {
  items: T[];
  pendingResolves: Array<(value: T) => void>;
  MAX_QUEUE_SIZE: number;

  constructor() {
    this.items = [];
    this.pendingResolves = [];
    this.MAX_QUEUE_SIZE = MAX_QUEUE_SIZE;
  }

  enqueue(item: T): void {
    if (this.items.length >= MAX_QUEUE_SIZE) {
      throw new Error("Queue overflow");
    }
    if (this.pendingResolves.length > 0) {
      const resolve = this.pendingResolves.shift()!;
      resolve(item);
    } else {
      this.items.push(item);
    }
  }

  async dequeue(): Promise<T> {
    if (this.items.length > 0) {
      return this.items.shift()!;
    }
    return new Promise<T>((resolve) => {
      this.pendingResolves.push(resolve);
    });
  }

  drain(batchSize: number = 100): T[] {
    const drained: T[] = [];
    while (drained.length < batchSize && this.items.length > 0) {
      drained.push(this.items.shift()!);
    }
    return drained;
  }

  prepend(items: T[]): void {
    this.items.unshift(...items);
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  size(): number {
    return this.items.length;
  }
}
