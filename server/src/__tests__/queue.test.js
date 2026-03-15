import { jest } from "@jest/globals";

// Mock config before importing the module under test
jest.unstable_mockModule("../config/config.js", () => ({
  default: { MAX_QUEUE_SIZE: 5 },
}));

const { AsyncQueue } = await import("../utils/queue.js");

describe("AsyncQueue", () => {
  let queue;

  beforeEach(() => {
    queue = new AsyncQueue();
  });

  describe("enqueue / dequeue", () => {
    it("should enqueue and dequeue items in FIFO order", async () => {
      queue.enqueue("a");
      queue.enqueue("b");
      queue.enqueue("c");

      expect(await queue.dequeue()).toBe("a");
      expect(await queue.dequeue()).toBe("b");
      expect(await queue.dequeue()).toBe("c");
    });

    it("dequeue should wait when queue is empty and resolve when an item is enqueued", async () => {
      const dequeuePromise = queue.dequeue();

      // Queue is empty, so the promise should be pending
      queue.enqueue("delayed");

      const result = await dequeuePromise;
      expect(result).toBe("delayed");
    });

    it("should resolve multiple pending dequeues in order", async () => {
      const p1 = queue.dequeue();
      const p2 = queue.dequeue();

      queue.enqueue("first");
      queue.enqueue("second");

      expect(await p1).toBe("first");
      expect(await p2).toBe("second");
    });
  });

  describe("overflow", () => {
    it("should throw when queue exceeds MAX_QUEUE_SIZE", () => {
      // MAX_QUEUE_SIZE is mocked to 5
      for (let i = 0; i < 5; i++) {
        queue.enqueue(i);
      }
      expect(() => queue.enqueue("overflow")).toThrow("Queue overflow");
    });
  });

  describe("drain", () => {
    it("should drain all items when fewer than batchSize", () => {
      queue.enqueue(1);
      queue.enqueue(2);
      queue.enqueue(3);

      const drained = queue.drain();
      expect(drained).toEqual([1, 2, 3]);
      expect(queue.isEmpty()).toBe(true);
    });

    it("should drain only up to batchSize items", () => {
      queue.enqueue(1);
      queue.enqueue(2);
      queue.enqueue(3);

      const drained = queue.drain(2);
      expect(drained).toEqual([1, 2]);
      expect(queue.size()).toBe(1);
    });

    it("should return empty array when queue is empty", () => {
      expect(queue.drain()).toEqual([]);
    });
  });

  describe("prepend", () => {
    it("should add items to the front of the queue", () => {
      queue.enqueue("c");
      queue.prepend(["a", "b"]);

      expect(queue.drain()).toEqual(["a", "b", "c"]);
    });
  });

  describe("isEmpty / size", () => {
    it("should report empty for a new queue", () => {
      expect(queue.isEmpty()).toBe(true);
      expect(queue.size()).toBe(0);
    });

    it("should update after enqueue and dequeue", async () => {
      queue.enqueue("x");
      expect(queue.isEmpty()).toBe(false);
      expect(queue.size()).toBe(1);

      await queue.dequeue();
      expect(queue.isEmpty()).toBe(true);
      expect(queue.size()).toBe(0);
    });
  });
});
