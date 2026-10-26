import { initTRPC, TRPCError } from "@trpc/server";
import config from "../config/config.js";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";

export interface TrpcContext {
  session: {
    userId?: number;
    username?: string;
    userRole?: string;
    userVersion?: string;
  };
}

export const createContext = ({
  req,
}: CreateExpressContextOptions): TrpcContext => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sess = req.session as any;
  return {
    session: {
      userId: sess?.userId as number | undefined,
      username: sess?.username as string | undefined,
      userRole: sess?.userRole as string | undefined,
      userVersion: sess?.userVersion as string | undefined,
    },
  };
};

const t = initTRPC.context<TrpcContext>().create();

export const router = t.router;

import { getSessionUser } from "../services/sessionAccess.js";
import {
  accessScope,
  loadAccessScope,
  canOperate,
} from "../services/accessScope.js";
import { authorizeAssetRequest } from "../middleware/assetAccess.js";

export const authedProcedure = t.procedure.use(
  async ({ ctx, next, type, path, getRawInput }) => {
    if (config.RECOVERY_MODE && type === "mutation")
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Recovery preview is read-only",
      });
    const user = await getSessionUser(ctx.session);
    if (!user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }
    if (
      type === "mutation" &&
      !(path === "alarm.acknowledge" && canOperate(user.role)) &&
      user.role !== "admin"
    )
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Admin access required",
      });
    const scope = await loadAccessScope(user.id, user.role);
    return accessScope.run(scope, async () => {
      const input = ((await getRawInput()) ?? {}) as Record<string, unknown>;
      if (user.role !== "admin") {
        const route = {
          "dashboard.list": "/dashboards",
          "dashboard.getById": `/dashboards/${encodeURIComponent(String(input.id))}`,
          "alarm.list": "/alarms",
          "alarm.listRules": "/alarms/rules",
          "alarm.acknowledge": `/alarms/${input.id}/acknowledge`,
          "nodeData.history": "/node-data",
          "nodeData.aggregates": "/aggregates",
          "annotation.list": "/annotations",
        }[path];
        if (!route)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Administrator access required",
          });
        try {
          await authorizeAssetRequest(
            type === "mutation" ? "POST" : "GET",
            route,
            input,
            input,
          );
        } catch {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Asset access denied",
          });
        }
      }
      return next({
        ctx: {
          session: { ...ctx.session, userRole: user.role } as {
            userId: number;
            username: string;
            userRole: string;
          },
        },
      });
    });
  },
);

export const adminProcedure = authedProcedure.use(({ ctx, next }) => {
  if (ctx.session.userRole !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
  return next();
});
