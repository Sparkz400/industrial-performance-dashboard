import { beforeEach, expect, it, vi } from "vitest";

// Each awaited query takes the next scripted result, in the order signInAccount runs them.
const mocks = vi.hoisted(() => {
  const results: unknown[] = [];
  const calls: string[] = [];
  const chain: Record<string, unknown> = {};
  for (const step of [
    "select",
    "from",
    "where",
    "for",
    "delete",
    "update",
    "set",
    "insert",
    "values",
    "returning",
  ])
    chain[step] = (..._args: unknown[]) => {
      calls.push(step);
      return chain;
    };
  chain.then = (resolve: (v: unknown) => void) => resolve(results.shift());
  return {
    results,
    calls,
    db: {
      ...chain,
      transaction: async (work: (tx: unknown) => unknown) => work(chain),
    },
  };
});
vi.mock("../../database/db.js", () => ({ default: mocks.db }));
import { signInAccount } from "../../services/oidc.js";
import { sessionEvents } from "../../services/sessionAccess.js";

const claims = { iss: "https://idp", sub: "s1", groups: ["plant-a"] } as never;
const user = { id: 5, role: "operator", isActive: true };
beforeEach(() => {
  mocks.results.length = 0;
  mocks.calls.length = 0;
});

it("revokes live sessions when a sign-in drops a site", async () => {
  const revoked = vi.fn();
  sessionEvents.on("userRevoked", revoked);
  mocks.results.push(
    [{ groupName: "plant-a", role: "operator", plantIds: [1] }],
    [user],
    [{ plantId: 1 }, { plantId: 2 }], // plant 2 was lost
    [{ ...user, updatedAt: new Date() }],
    undefined,
  );
  await signInAccount(claims);
  sessionEvents.off("userRevoked", revoked);
  expect(mocks.calls).toContain("update");
  expect(revoked).toHaveBeenCalledWith(5);
});

it("leaves sessions alone when the sites are unchanged", async () => {
  const revoked = vi.fn();
  sessionEvents.on("userRevoked", revoked);
  mocks.results.push(
    [{ groupName: "plant-a", role: "operator", plantIds: [1] }],
    [user],
    [{ plantId: 1 }],
    undefined,
  );
  await signInAccount(claims);
  sessionEvents.off("userRevoked", revoked);
  expect(mocks.calls).not.toContain("update");
  expect(revoked).not.toHaveBeenCalled();
});
