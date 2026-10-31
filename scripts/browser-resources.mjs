import assert from "node:assert/strict";

export const browserResourcePolicy = Object.freeze({
  warmupSamples: 2,
  windowSamples: 3,
  growthLimits: {
    jsHeapUsedBytes: 128 * 1024 * 1024,
    backingStorageBytes: 128 * 1024 * 1024,
    domNodes: 30000,
    eventListeners: 30000,
  },
});

// CDPSession.send has no timeout option; a stalled target must fail the check.
async function bounded(operation, label) {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Chromium resource timeout: ${label}`)),
          5000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function captureBrowserResources(browser) {
  const contexts = browser.contexts();
  const pages = [];
  for (const [contextIndex, context] of contexts.entries()) {
    for (const [pageIndex, page] of context.pages().entries()) {
      const session = await bounded(context.newCDPSession(page), "attach");
      try {
        const heap = await bounded(
          session.send("Runtime.getHeapUsage"),
          "heap",
        );
        const dom = await bounded(session.send("Memory.getDOMCounters"), "DOM");
        const values = {
          jsHeapUsedBytes: heap.usedSize,
          jsHeapTotalBytes: heap.totalSize,
          embedderHeapUsedBytes: heap.embedderHeapUsedSize,
          backingStorageBytes: heap.backingStorageSize,
          documents: dom.documents,
          domNodes: dom.nodes,
          eventListeners: dom.jsEventListeners,
        };
        for (const [key, value] of Object.entries(values))
          assert(
            Number.isFinite(value) && value >= 0,
            `Missing/invalid Chromium metric: ${key}`,
          );
        pages.push({ contextIndex, pageIndex, ...values });
      } finally {
        await bounded(session.detach(), "detach");
      }
    }
  }
  return {
    at: new Date().toISOString(),
    contexts: contexts.length,
    pages,
    scope:
      "Per-target Chromium isolate heap and DOM; shared isolates must not be summed; excludes total browser/GPU memory",
  };
}

// Natural workload samples: no forced garbage collection, reload or browser replacement.
export function createBrowserResourceTracker(expectedContexts) {
  let sampleCount = 0,
    baseline;
  const window = [];
  return (sample) => {
    assert.equal(
      sample.contexts,
      expectedContexts,
      "Browser context count changed",
    );
    assert.equal(
      sample.pages.length,
      expectedContexts,
      "Browser page count changed",
    );
    for (let index = 0; index < expectedContexts; index++) {
      assert.equal(sample.pages[index].contextIndex, index);
      assert.equal(sample.pages[index].pageIndex, 0);
      for (const metric of Object.keys(browserResourcePolicy.growthLimits))
        assert(
          Number.isFinite(sample.pages[index][metric]) &&
            sample.pages[index][metric] >= 0,
          `Invalid resource sample: ${metric}`,
        );
    }
    sampleCount++;
    if (sampleCount === browserResourcePolicy.warmupSamples)
      baseline = structuredClone(sample);
    if (sampleCount > browserResourcePolicy.warmupSamples)
      window.push(structuredClone(sample));
    if (window.length > browserResourcePolicy.windowSamples) window.shift();
    const violations = [];
    if (window.length === browserResourcePolicy.windowSamples) {
      for (const [index, page] of baseline.pages.entries()) {
        for (const [metric, growthLimit] of Object.entries(
          browserResourcePolicy.growthLimits,
        )) {
          const minimumWindow = Math.min(
            ...window.map((entry) => entry.pages[index][metric]),
          );
          if (minimumWindow > page[metric] + growthLimit)
            violations.push({
              contextIndex: page.contextIndex,
              pageIndex: page.pageIndex,
              metric,
              baseline: page[metric],
              minimumWindow,
              growthLimit,
            });
        }
      }
    }
    return {
      status:
        window.length < browserResourcePolicy.windowSamples
          ? "warming-up"
          : violations.length
            ? "exceeded"
            : "within-budget",
      sampleCount,
      policy: browserResourcePolicy,
      violations,
    };
  };
}
