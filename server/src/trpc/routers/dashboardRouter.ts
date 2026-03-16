import { z } from "zod";
import { router, authedProcedure } from "../trpc.js";
import { dashboardService } from "../../services/dashboardService.js";

export const dashboardRouter = router({
  list: authedProcedure.query(async () => {
    return dashboardService.listDashboards();
  }),

  getById: authedProcedure
    .input(z.object({ id: z.string().min(3).max(100) }))
    .query(async ({ input }) => {
      return dashboardService.getDashboardById(input.id);
    }),

  save: authedProcedure
    .input(
      z.object({
        id: z.string().min(3).max(100),
        name: z.string().min(1).max(100),
        widgets: z.array(z.any()).default([]),
        layout: z.array(z.any()).default([]),
      }),
    )
    .mutation(async ({ input }) => {
      return dashboardService.saveDashboard(input);
    }),

  delete: authedProcedure
    .input(z.object({ id: z.string().min(3).max(100) }))
    .mutation(async ({ input }) => {
      await dashboardService.deleteDashboard(input.id);
      return { message: "Dashboard deleted successfully" };
    }),
});
