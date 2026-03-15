import express, { type Request, type Response } from "express";
import Joi from "joi";
import { validateBody } from "../middleware/validation.js";
import dbClient from "../database/dbConnection.js";
import multiMachineManager from "../opc-ua/services/multiMachineManager.js";
import logger from "../utils/logger.js";

const router = express.Router();

// --- Validation Schemas ---
const machineSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  ip: Joi.string().required(),
  port: Joi.number().port().required(),
  resourcePath: Joi.string().allow("").default(""),
  securityMode: Joi.string()
    .valid("None", "Sign", "SignAndEncrypt")
    .default("None"),
  securityPolicy: Joi.string().default("None"),
  isActive: Joi.boolean().default(true),
});

const nodeMappingSchema = Joi.object({
  mappings: Joi.array()
    .items(
      Joi.object({
        nodeId: Joi.string().required(),
        nodeKey: Joi.string().required(),
        displayName: Joi.string().required(),
        dataType: Joi.string().default("Double"),
        samplingInterval: Joi.number().integer().min(100).default(500),
        isActive: Joi.boolean().default(true),
      }),
    )
    .min(1)
    .required(),
});

const browseSchema = Joi.object({
  parentNodeId: Joi.string().allow("").default(""),
});

// --- Machine CRUD ---

// GET /api/machines — list all machines
router.get("/", async (req: Request, res: Response) => {
  try {
    const result = await dbClient.query(
      "SELECT * FROM machines ORDER BY name ASC",
    );

    // Attach mapping count to each machine
    const machines = await Promise.all(
      result.rows.map(async (machine: any) => {
        const mappingResult = await dbClient.query(
          "SELECT COUNT(*) as count FROM node_mappings WHERE machine_id = $1",
          [machine.id],
        );
        return {
          ...machine,
          mappingCount: parseInt(mappingResult.rows[0].count, 10),
        };
      }),
    );

    res.json(machines);
  } catch (err: any) {
    logger.error("Error fetching machines:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/machines — add a new machine
router.post(
  "/",
  validateBody(machineSchema),
  async (req: Request, res: Response) => {
    try {
      const {
        name,
        ip,
        port,
        resourcePath,
        securityMode,
        securityPolicy,
        isActive,
      } = req.body;

      const normalizedPath =
        typeof resourcePath === "string"
          ? resourcePath.trim() === "" || resourcePath.trim() === "/"
            ? ""
            : resourcePath.trim().startsWith("/")
              ? resourcePath.trim()
              : `/${resourcePath.trim()}`
          : "";

      const endpointUrl = `opc.tcp://${ip}:${port}${normalizedPath}`;

      const result = await dbClient.query(
        `INSERT INTO machines (name, endpoint_url, ip, port, resource_path, security_mode, security_policy, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
        [
          name,
          endpointUrl,
          ip,
          port,
          normalizedPath,
          securityMode,
          securityPolicy,
          isActive,
        ],
      );

      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      if (err.code === "23505") {
        res
          .status(409)
          .json({ error: "A machine with this endpoint URL already exists" });
        return;
      }
      logger.error("Error creating machine:", err);
      res.status(500).json({ error: err.message });
    }
  },
);

// GET /api/machines/:id — get machine with its mappings
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const machineResult = await dbClient.query(
      "SELECT * FROM machines WHERE id = $1",
      [id],
    );

    if (machineResult.rows.length === 0) {
      res.status(404).json({ error: "Machine not found" });
      return;
    }

    const mappingsResult = await dbClient.query(
      "SELECT * FROM node_mappings WHERE machine_id = $1 ORDER BY node_key",
      [id],
    );

    res.json({
      ...machineResult.rows[0],
      mappings: mappingsResult.rows,
    });
  } catch (err: any) {
    logger.error("Error fetching machine:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/machines/:id — update machine config
router.put(
  "/:id",
  validateBody(machineSchema),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const {
        name,
        ip,
        port,
        resourcePath,
        securityMode,
        securityPolicy,
        isActive,
      } = req.body;

      const normalizedPath =
        typeof resourcePath === "string"
          ? resourcePath.trim() === "" || resourcePath.trim() === "/"
            ? ""
            : resourcePath.trim().startsWith("/")
              ? resourcePath.trim()
              : `/${resourcePath.trim()}`
          : "";

      const endpointUrl = `opc.tcp://${ip}:${port}${normalizedPath}`;

      const result = await dbClient.query(
        `UPDATE machines
             SET name = $1, endpoint_url = $2, ip = $3, port = $4, resource_path = $5,
                 security_mode = $6, security_policy = $7, is_active = $8, updated_at = NOW()
             WHERE id = $9
             RETURNING *`,
        [
          name,
          endpointUrl,
          ip,
          port,
          normalizedPath,
          securityMode,
          securityPolicy,
          isActive,
          id,
        ],
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Machine not found" });
        return;
      }

      // Reconnect the machine with new config
      try {
        await multiMachineManager.refreshMachineConnection(parseInt(id, 10));
      } catch (connErr: any) {
        logger.warn(
          `Machine ${id} config updated but reconnect failed: ${connErr.message}`,
        );
      }

      res.json(result.rows[0]);
    } catch (err: any) {
      if (err.code === "23505") {
        res
          .status(409)
          .json({ error: "A machine with this endpoint URL already exists" });
        return;
      }
      logger.error("Error updating machine:", err);
      res.status(500).json({ error: err.message });
    }
  },
);

// DELETE /api/machines/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await multiMachineManager.disconnectMachine(parseInt(id, 10));

    const result = await dbClient.query(
      "DELETE FROM machines WHERE id = $1 RETURNING *",
      [id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "Machine not found" });
      return;
    }

    res.json({ message: "Machine deleted", machine: result.rows[0] });
  } catch (err: any) {
    logger.error("Error deleting machine:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/machines/:id/connect — connect to machine
router.post("/:id/connect", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await multiMachineManager.refreshMachineConnection(parseInt(id, 10));
    res.json({ message: "Machine connection initiated" });
  } catch (err: any) {
    logger.error(`Error connecting machine ${req.params.id}:`, err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/machines/:id/disconnect — disconnect from machine
router.post("/:id/disconnect", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await multiMachineManager.disconnectMachine(parseInt(id, 10));
    res.json({ message: "Machine disconnected" });
  } catch (err: any) {
    logger.error(`Error disconnecting machine ${req.params.id}:`, err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/machines/:id/browse-nodes — browse OPC-UA nodes
router.post(
  "/:id/browse-nodes",
  validateBody(browseSchema),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { parentNodeId } = req.body;

      const nodes = await multiMachineManager.browseNodes(
        parseInt(id, 10),
        parentNodeId || undefined,
      );

      res.json(nodes);
    } catch (err: any) {
      logger.error(`Error browsing nodes for machine ${req.params.id}:`, err);
      res.status(500).json({ error: err.message });
    }
  },
);

// --- Node Mapping Routes ---

// GET /api/machines/:id/mappings
router.get("/:id/mappings", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await dbClient.query(
      "SELECT * FROM node_mappings WHERE machine_id = $1 ORDER BY node_key",
      [id],
    );
    res.json(result.rows);
  } catch (err: any) {
    logger.error("Error fetching node mappings:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/machines/:id/mappings — bulk upsert mappings
router.post(
  "/:id/mappings",
  validateBody(nodeMappingSchema),
  async (req: Request, res: Response) => {
    try {
      const machineId = parseInt(req.params.id, 10);
      const { mappings } = req.body;

      // Verify machine exists
      const machineResult = await dbClient.query(
        "SELECT id FROM machines WHERE id = $1",
        [machineId],
      );
      if (machineResult.rows.length === 0) {
        res.status(404).json({ error: "Machine not found" });
        return;
      }

      const results = [];
      for (const mapping of mappings) {
        const result = await dbClient.query(
          `INSERT INTO node_mappings (machine_id, node_id, node_key, display_name, data_type, sampling_interval, is_active)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (machine_id, node_id) DO UPDATE
                 SET node_key = EXCLUDED.node_key,
                     display_name = EXCLUDED.display_name,
                     data_type = EXCLUDED.data_type,
                     sampling_interval = EXCLUDED.sampling_interval,
                     is_active = EXCLUDED.is_active,
                     updated_at = NOW()
                 RETURNING *`,
          [
            machineId,
            mapping.nodeId,
            mapping.nodeKey,
            mapping.displayName,
            mapping.dataType,
            mapping.samplingInterval,
            mapping.isActive,
          ],
        );
        results.push(result.rows[0]);
      }

      // Refresh connection to pick up new mappings
      try {
        await multiMachineManager.refreshMachineConnection(machineId);
      } catch (connErr: any) {
        logger.warn(
          `Mappings saved but reconnect failed for machine ${machineId}: ${connErr.message}`,
        );
      }

      res.json(results);
    } catch (err: any) {
      logger.error("Error saving node mappings:", err);
      res.status(500).json({ error: err.message });
    }
  },
);

// DELETE /api/machines/:id/mappings/:mappingId
router.delete(
  "/:id/mappings/:mappingId",
  async (req: Request, res: Response) => {
    try {
      const { id, mappingId } = req.params;

      const result = await dbClient.query(
        "DELETE FROM node_mappings WHERE id = $1 AND machine_id = $2 RETURNING *",
        [mappingId, id],
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Mapping not found" });
        return;
      }

      // Refresh connection
      try {
        await multiMachineManager.refreshMachineConnection(parseInt(id, 10));
      } catch (connErr: any) {
        logger.warn(`Mapping deleted but reconnect failed: ${connErr.message}`);
      }

      res.json({ message: "Mapping deleted", mapping: result.rows[0] });
    } catch (err: any) {
      logger.error("Error deleting node mapping:", err);
      res.status(500).json({ error: err.message });
    }
  },
);

export default router;
