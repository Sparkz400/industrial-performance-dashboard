const config = require('../config/config');
const MAX_QUEUE_SIZE = config.MAX_QUEUE_SIZE;

class AsyncQueue {
    constructor() {
        this.items = [];
        this.pendingResolves = [];
    }

    enqueue(item) {
        if (this.items.length >= MAX_QUEUE_SIZE) {
            throw new Error('Queue overflow');
        }
        if (this.pendingResolves.length > 0) {
            const resolve = this.pendingResolves.shift();
            resolve(item);
        } else {
            this.items.push(item);
        }
    }

    async dequeue() {
        if (this.items.length > 0) {
            return this.items.shift();
        }
        return new Promise((resolve) => {
            this.pendingResolves.push(resolve);
        });
    }

    drain(batchSize = 100) {
        const drained = [];
        while (drained.length < batchSize && this.items.length > 0) {
            drained.push(this.items.shift());
        }
        return drained;
    }

    prepend(items) {
        this.items.unshift(...items);
    }

    isEmpty() {
        return this.items.length === 0;
    }

    size() {
        return this.items.length;
    }
}

module.exports = { AsyncQueue };