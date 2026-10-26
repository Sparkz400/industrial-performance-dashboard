import { expect, it } from "vitest";
import {
  analyzeLine,
  lineTimeline,
  type LineConfig,
} from "../../services/lineAnalysis.js";
const states = {
  running: [1],
  idle: [0],
  fault: [2],
  blocked: [3],
  starved: [4],
};
const config: LineConfig = {
  name: "Line",
  maxGapSeconds: 10,
  microstopSeconds: 5,
  machines: [
    {
      machineId: 1,
      stateKey: "state",
      cycleKey: "cycle",
      outputKey: "count",
      states,
    },
    {
      machineId: 2,
      stateKey: "state",
      cycleKey: null,
      outputKey: "count",
      states,
    },
  ],
  buffers: [{ from: 1, to: 2, machineId: 1, nodeKey: "buffer", capacity: 10 }],
};
const sample = (t: number, value: number | null, status_code = "Good") => ({
  timestamp: new Date(t * 1000).toISOString(),
  value,
  status_code,
});
it("identifies a slow observed cycle candidate without inventing downtime", () => {
  const configured = {
    ...config,
    machines: config.machines.map((m) => ({ ...m, cycleKey: "cycle" })),
  };
  const r = analyzeLine(
    configured,
    {
      "1:state": [sample(0, 1), sample(10, 1)],
      "2:state": [sample(0, 1), sample(10, 1)],
      "1:cycle": Array.from({ length: 10 }, (_, i) => sample(i, 100)),
      "2:cycle": Array.from({ length: 10 }, (_, i) => sample(i, 200)),
    },
    0,
    20000,
    10,
  );
  expect(r.candidates[0]).toMatchObject({
    machineId: 2,
    lossSeconds: 0,
    cycleP50Ms: 200,
  });
});
it("keeps missing state time unknown and does not invent target performance", () => {
  const r = analyzeLine(config, {}, 0, 20000, 100);
  expect(r.targetShortfall).toBeNull();
  expect(r.machines[0].coverage).toBe(0);
  expect(r.candidates).toEqual([]);
});
it("counts bounded microstops and exposes measured adjacent losses", () => {
  const r = analyzeLine(
    config,
    {
      "1:state": [sample(0, 1), sample(4, 2), sample(8, 1), sample(15, 1)],
      "2:state": [sample(0, 4), sample(10, 1)],
      "1:cycle": [sample(0, 100), sample(1, 200), sample(2, 999, "Bad")],
      "2:count": [sample(0, 0), sample(10, 3), sample(20, 5)],
    },
    0,
    20000,
    10,
  );
  expect(r.machines[0].microstops).toEqual({ count: 1, seconds: 4 });
  expect(r.machines[0].cycles.p95).toBe(200);
  expect(r.candidates[0].downstreamStarvedSeconds).toBe(10);
  expect(r.targetShortfall).toBe(5);
});
it("excludes counter resets and stale samples", () => {
  const r = analyzeLine(
    config,
    { "2:count": [sample(0, 9), sample(10, 1), sample(20, 2)] },
    0,
    20000,
    10,
  );
  expect(r.targetShortfall).toBeNull();
  expect(r.machines[1].output.resets).toBe(1);
  expect(
    lineTimeline([sample(0, 1)], states, 0, 20000, 10000).at(-1)?.state,
  ).toBe("unknown");
});
it("counts a multi-reason stop once without counting unknown time", () => {
  const r = analyzeLine(
    config,
    {
      "1:state": [
        sample(0, 1),
        sample(4, 2),
        sample(6, 0),
        sample(8, 1),
        sample(10, null),
        sample(12, 0),
        sample(14, 1),
      ],
    },
    0,
    20000,
    10,
  );
  expect(r.machines[0].microstops).toEqual({ count: 1, seconds: 4 });
});
it("does not double-count adjacent loss when machines share two buffers", () => {
  const r = analyzeLine(
    {
      ...config,
      buffers: [
        ...config.buffers,
        { ...config.buffers[0], nodeKey: "buffer2" },
      ],
    },
    {
      "1:state": [sample(0, 2), sample(10, 1)],
      "2:state": [sample(0, 4), sample(10, 1)],
    },
    0,
    20000,
    10,
  );
  expect(r.candidates[0].downstreamStarvedSeconds).toBe(10);
});
