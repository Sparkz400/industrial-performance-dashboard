import { initTRPC, TRPCError } from "@trpc/server";
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

export const authedProcedure = t.procedure.use(
  async ({ ctx, next, type, path }) => {
    const user = await getSessionUser(ctx.session);
    if (!user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }
    if (
      type === "mutation" &&
      path !== "alarm.acknowledge" &&
      user.role !== "admin"
    )
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Admin access required",
      });
    ctx.session.userRole = user.role;
    return next({
      ctx: {
        session: ctx.session as {
          userId: number;
          username: string;
          userRole: string;
        },
      },
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
