import type pg from "pg";
import { accessScope } from "../services/requestScope.js";

/** Serialize setting the scope and its query on a pooled connection, including callback callers. */
export function installQueryScope(client: pg.PoolClient): void {
  const query = client.query.bind(client) as (...args: any[]) => any;
  let pending: Promise<unknown> = Promise.resolve();
  client.query = ((...args: any[]) => {
    const callback = typeof args.at(-1) === "function" ? args.pop() : undefined;
    const scope = accessScope.getStore();
    const context = JSON.stringify(scope ?? { role: "system" });
    const text = typeof args[0] === "string" ? args[0] : args[0]?.text;
    // An aborted transaction must still be able to roll back before setting its next scope.
    const transactionControl =
      /^\s*(?:begin|commit|end|rollback|savepoint|release)\b/i.test(text ?? "");
    const result = pending.then(async () => {
      if (!transactionControl)
        await query("SELECT set_config('app.access_scope', $1, false)", [
          context,
        ]);
      return query(...args);
    });
    pending = result.catch(() => {});
    if (callback) {
      void result.then(
        (value) => callback(null, value),
        (error) => callback(error),
      );
      return;
    }
    return result;
  }) as pg.PoolClient["query"];
}
