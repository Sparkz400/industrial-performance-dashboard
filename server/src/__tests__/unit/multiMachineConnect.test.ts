import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const mappings = [{ nodeKey: "Count", nodeId: "ns=1;s=Count" }];
  // Thenable query builder: awaiting any step yields the mappings (or nothing for updates).
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => chain,
    set: () => chain,
    orderBy: () => Promise.resolve(mappings),
    then: (resolve: (value: unknown) => void) => resolve(undefined),
  };
  return {
    db: { select: () => chain, update: () => chain },
    connectAndSubscribe: vi.fn(),
  };
});
vi.mock("../../database/db.js", () => ({ default: mocks.db }));
vi.mock("../../opc-ua/opcuaClient.js", () => ({
  connectAndSubscribe: mocks.connectAndSubscribe,
}));
vi.mock("../../services/machineIdentity.js", () => ({}));
import multiMachineManager from "../../opc-ua/services/multiMachineManager.js";

const machine = {
  id: 7,
  name: "Owned press",
  endpointUrl: "opc.tcp://owned-fixture:4840",
} as never;
const fakeConnection = () => {
  const closed = { subscription: false, session: false, client: false };
  return {
    closed,
    connection: {
      subscription: {
        terminate: async () => void (closed.subscription = true),
      },
      session: { close: async () => void (closed.session = true) },
      client: { disconnect: async () => void (closed.client = true) },
    },
  };
};

afterEach(async () => {
  await multiMachineManager.disconnectAll();
  mocks.connectAndSubscribe.mockReset();
});

it("never leaves an orphaned subscription when connects overlap (one at a time per machine)", async () => {
  const first = fakeConnection(),
    second = fakeConnection();
  let releaseFirst!: () => void;
  mocks.connectAndSubscribe
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseFirst = () => resolve(first.connection);
        }),
    )
    .mockResolvedValueOnce(second.connection);
  const a = multiMachineManager.connectMachine(machine);
  const b = multiMachineManager.connectMachine(machine);
  await vi.waitFor(() => expect(releaseFirst).toBeTypeOf("function"));
  // The second connect waits instead of opening a parallel session.
  expect(mocks.connectAndSubscribe).toHaveBeenCalledTimes(1);
  releaseFirst();
  await Promise.all([a, b]);
  expect(mocks.connectAndSubscribe).toHaveBeenCalledTimes(2);
  // The first connection was closed before the second replaced it.
  expect(first.closed).toEqual({
    subscription: true,
    session: true,
    client: true,
  });
  expect(second.closed.subscription).toBe(false);
});

it("applies a disconnect requested during a connect after that connect", async () => {
  const only = fakeConnection();
  let release!: () => void;
  mocks.connectAndSubscribe.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve(only.connection);
      }),
  );
  const connecting = multiMachineManager.connectMachine(machine);
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  const disconnecting = multiMachineManager.disconnectMachine(7);
  release();
  await Promise.all([connecting, disconnecting]);
  expect(only.closed.subscription).toBe(true);
  expect(multiMachineManager.getMachineConnection(7)).toBeUndefined();
});
