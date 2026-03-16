import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";

export interface TrpcContext {
  session: {
    userId?: number;
    username?: string;
    userRole?: string;
  };
}

export const createContext = ({
  req,
}: CreateExpressContextOptions): TrpcContext => {
  const session = (req as any).session ?? {};
  return {
    session: {
      userId: session.userId,
      username: session.username,
      userRole: session.userRole,
    },
  };
};

const t = initTRPC.context<TrpcContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }
  return next({
    ctx: {
      session: ctx.session as {
        userId: number;
        username: string;
        userRole: string;
      },
    },
  });
});

export const adminProcedure = authedProcedure.use(({ ctx, next }) => {
  if (ctx.session.userRole !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
  return next();
});
