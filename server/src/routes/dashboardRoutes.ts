import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import dbClient from "../database/dbConnection.js";
import logger from "../utils/logger.js";
import { validateParams } from "../middleware/validation.js";
import Joi from "joi";

const router = express.Router();

// ID validation schema
const idParamSchema = Joi.object({
  id: Joi.string().required().min(3).max(100),
});

router.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error("Dashboard route error:", err);

  if (err.name === "ValidationError") {
    res.status(400).json({
      error: "Validation Error",
      details: err.message,
    });
    return;
  }

  if (err.code === "23505") {
    res.status(409).json({
      error: "Conflict Error",
      details: "A dashboard with this ID already exists",
    });
    return;
  }

  if (err.code === "ECONNREFUSED" || err.code === "08006") {
    res.status(503).json({
      error: "Database Connection Error",
      details: "Unable to connect to the database",
    });
    return;
  }

  res.status(500).json({
    error: "Internal Server Error",
    details:
      process.env.NODE_ENV === "production"
        ? "An unexpected error occurred"
        : err.message,
  });
});

// GET /api/dashboards
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await dbClient.query(
      "SELECT * FROM dashboards ORDER BY name",
    );

    if (result.rows.length === 0) {
      logger.info("No dashboards found. Creating a default dashboard.");

      const defaultDashboard = {
        id: "dashboard-default-" + Date.now(),
        name: "Default Dashboard",
        widgets: [] as any[],
        layout: [] as any[],
      };

      const insertQuery = `
                INSERT INTO dashboards (id, name, widgets, layout)
                VALUES ($1, $2, $3, $4)
                RETURNING *;
            `;

      const widgetsJson = JSON.stringify(defaultDashboard.widgets);
      const layoutJson = JSON.stringify(defaultDashboard.layout);

      const insertResult = await dbClient.query(insertQuery, [
        defaultDashboard.id,
        defaultDashboard.name,
        widgetsJson,
        layoutJson,
      ]);

      res.json(insertResult.rows);
    } else {
      res.json(result.rows);
    }
  } catch (err) {
    logger.error("Error fetching dashboards:", err);
    next(err);
  }
});

// POST /api/dashboards/import
// Import a dashboard from a JSON config, creating it with a new ID
router.post(
  "/import",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, widgets, layout } = req.body;

      if (!name || typeof name !== "string" || name.trim() === "") {
        res.status(400).json({
          error: "Validation Error",
          message: "Dashboard name is required",
        });
        return;
      }

      const id = "dashboard-imported-" + Date.now();
      const widgetsJson = JSON.stringify(Array.isArray(widgets) ? widgets : []);
      const layoutJson = JSON.stringify(Array.isArray(layout) ? layout : []);

      const result = await dbClient.query(
        `INSERT INTO dashboards (id, name, widgets, layout)
             VALUES ($1, $2, $3, $4)
             RETURNING *;`,
        [id, name.trim(), widgetsJson, layoutJson],
      );

      const dashboard = result.rows[0];
      if (typeof dashboard.widgets === "string")
        dashboard.widgets = JSON.parse(dashboard.widgets);
      if (typeof dashboard.layout === "string")
        dashboard.layout = JSON.parse(dashboard.layout);

      res.status(201).json(dashboard);
    } catch (err) {
      logger.error("Error importing dashboard:", err);
      next(err);
    }
  },
);

// GET /api/dashboards/:id
// Returns a single dashboard by ID
router.get(
  "/:id",
  validateParams(idParamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await dbClient.query(
        "SELECT * FROM dashboards WHERE id = $1",
        [req.params.id],
      );
      if (result.rows.length === 0) {
        res.status(404).json({ error: "Dashboard not found" });
        return;
      }
      const dashboard = result.rows[0];
      if (typeof dashboard.widgets === "string")
        dashboard.widgets = JSON.parse(dashboard.widgets);
      if (typeof dashboard.layout === "string")
        dashboard.layout = JSON.parse(dashboard.layout);
      res.json(dashboard);
    } catch (err) {
      logger.error("Error fetching dashboard:", err);
      next(err);
    }
  },
);

// POST /api/dashboards/:id
router.post("/:id", async (req: Request, res: Response) => {
  let client: any = null;

  try {
    const id = req.params.id;
    if (!id || id.length < 3) {
      res.status(400).json({
        error: "Validation Error",
        message: "Invalid dashboard ID",
      });
      return;
    }

    const { name } = req.body;
    if (!name || typeof name !== "string" || name.trim() === "") {
      res.status(400).json({
        error: "Validation Error",
        message: "Dashboard name is required",
      });
      return;
    }

    let widgets = req.body.widgets || [];
    let layout = req.body.layout || [];

    if (typeof widgets === "string") {
      try {
        widgets = JSON.parse(widgets);
      } catch (e: any) {
        console.error(
          "Error parsing widgets JSON, using empty array:",
          e.message,
        );
        widgets = [];
      }
    } else if (!Array.isArray(widgets)) {
      widgets = [];
    }

    if (typeof layout === "string") {
      try {
        layout = JSON.parse(layout);
      } catch (e: any) {
        console.error(
          "Error parsing layout JSON, using empty array:",
          e.message,
        );
        layout = [];
      }
    } else if (!Array.isArray(layout)) {
      layout = [];
    }

    const widgetsJson = JSON.stringify(widgets);
    const layoutJson = JSON.stringify(layout);

    try {
      client = await dbClient.pool.connect();
    } catch (dbConnErr) {
      console.error("Database connection error:", dbConnErr);
      res.status(503).json({
        error: "Database Error",
        message: "Unable to connect to database",
      });
      return;
    }

    try {
      await client.query("BEGIN");

      const query = `
                INSERT INTO dashboards (id, name, widgets, layout)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (id) DO UPDATE SET
                                           name = EXCLUDED.name,
                                           widgets = EXCLUDED.widgets,
                                           layout = EXCLUDED.layout
                RETURNING *;
            `;

      const result = await client.query(query, [
        id,
        name.trim(),
        widgetsJson,
        layoutJson,
      ]);

      try {
        const historyQuery = `
                    INSERT INTO dashboard_history (dashboard_id, action, timestamp, user_id)
                    VALUES ($1, $2, NOW(), $3);
                `;
        await client.query(historyQuery, [id, "UPDATE", null]);
      } catch (historyErr: any) {
        console.warn("Error updating history:", historyErr.message);
      }

      await client.query("COMMIT");

      let savedDashboard = result.rows[0];

      try {
        if (typeof savedDashboard.widgets === "string") {
          savedDashboard.widgets = JSON.parse(savedDashboard.widgets);
        }
        if (!Array.isArray(savedDashboard.widgets)) {
          savedDashboard.widgets = [];
        }
      } catch (e: any) {
        console.warn("Error parsing widgets for response:", e.message);
        savedDashboard.widgets = [];
      }

      try {
        if (typeof savedDashboard.layout === "string") {
          savedDashboard.layout = JSON.parse(savedDashboard.layout);
        }
        if (!Array.isArray(savedDashboard.layout)) {
          savedDashboard.layout = [];
        }
      } catch (e: any) {
        console.warn("Error parsing layout for response:", e.message);
        savedDashboard.layout = [];
      }

      res.json(savedDashboard);
      return;
    } catch (queryErr: any) {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackErr) {
          console.error("Error during rollback:", rollbackErr);
        }
      }

      console.error("Database query error:", queryErr);

      if (queryErr.code === "42P01") {
        res.status(500).json({
          error: "Database Error",
          message: "Table does not exist. Did you run the database setup?",
        });
        return;
      }

      if (queryErr.code === "23505") {
        res.status(409).json({
          error: "Conflict Error",
          message: "A dashboard with this ID already exists",
        });
        return;
      }

      res.status(500).json({
        error: "Database Error",
        message: queryErr.message,
      });
      return;
    }
  } catch (err: any) {
    console.error("Unexpected error:", err);
    res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
    return;
  } finally {
    if (client) {
      try {
        client.release();
      } catch (releaseErr) {
        console.error("Error releasing client:", releaseErr);
      }
    }
  }
});

// DELETE /api/dashboards/:id
router.delete(
  "/:id",
  validateParams(idParamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id;
      await dbClient.query("DELETE FROM dashboards WHERE id = $1", [id]);
      res.json({ message: "Dashboard deleted successfully" });
    } catch (err) {
      logger.error("Error deleting dashboard:", err);
      next(err);
    }
  },
);

export default router;
