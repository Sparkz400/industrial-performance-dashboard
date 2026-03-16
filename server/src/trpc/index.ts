import { router } from "./trpc.js";
import { dashboardRouter } from "./routers/dashboardRouter.js";
import { alarmRouter } from "./routers/alarmRouter.js";
import { nodeDataRouter } from "./routers/nodeDataRouter.js";
import { annotationRouter } from "./routers/annotationRouter.js";
import { statusRouter } from "./routers/statusRouter.js";

export const appRouter = router({
  dashboard: dashboardRouter,
  alarm: alarmRouter,
  nodeData: nodeDataRouter,
  annotation: annotationRouter,
  status: statusRouter,
});

export type AppRouter = typeof appRouter;
export { createContext } from "./trpc.js";
