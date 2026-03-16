import { router, authedProcedure } from "../trpc.js";
import statusManager from "../../utils/status.js";

export const statusRouter = router({
  current: authedProcedure.query(() => {
    return statusManager.getFullStatus();
  }),
});
