import { z } from "zod";
import { router, authedProcedure } from "../trpc.js";
import { annotationRepository } from "../../repositories/annotationRepository.js";

export const annotationRouter = router({
  list: authedProcedure
    .input(z.object({ dashboardId: z.string() }))
    .query(async ({ input }) => {
      return annotationRepository.listByDashboard(input.dashboardId);
    }),

  create: authedProcedure
    .input(
      z.object({
        id: z.string(),
        widgetId: z.string(),
        dashboardId: z.string(),
        text: z.string().min(1),
        color: z.string().max(20).default("#ff9800"),
        timestamp: z.string().datetime(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return annotationRepository.create({
        ...input,
        timestamp: new Date(input.timestamp),
        userId: ctx.session.userId,
      });
    }),

  update: authedProcedure
    .input(
      z.object({
        id: z.string(),
        text: z.string().min(1).optional(),
        color: z.string().max(20).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const updated = await annotationRepository.update(id, data);
      if (!updated) throw new Error("Annotation not found");
      return updated;
    }),

  delete: authedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const deleted = await annotationRepository.delete(input.id);
      if (!deleted) throw new Error("Annotation not found");
      return { message: "Annotation deleted successfully" };
    }),
});
