import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import dbPool from "../dbConnection.js";
import logger from "../../utils/logger.js";

const router = express.Router();

// A simple test endpoint to verify DB connectivity.
router.get("/test", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await dbPool.query("SELECT NOW()");
    res.json({ status: "ok", time: result.rows[0] });
  } catch (err) {
    logger.error("Database query error:", err);
    next(err);
  }
});

export default router;
