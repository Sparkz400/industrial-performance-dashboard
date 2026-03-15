import express, { type Request, type Response } from "express";
import opcuaConnectionManager from "../services/opcuaConnectionManager.js";
import logger from "../../utils/logger.js";
import Joi from "joi";
import { validateBody } from "../../middleware/validation.js";

const router = express.Router();

const opcuaConnectionSchema = Joi.object({
  ip: Joi.string().required(),
  port: Joi.number().port().required(),
  resourcePath: Joi.string().allow("").default(""),
  securityMode: Joi.string()
    .valid("None", "Sign", "SignAndEncrypt")
    .default("None"),
  securityPolicy: Joi.string().default("None"),
});

router.get("/status", (req: Request, res: Response) => {
  const connectionInfo = opcuaConnectionManager.getConnectionInfo();

  res.json({
    connected: connectionInfo.connected,
    status: connectionInfo.status,
    statusText: connectionInfo.statusText,
    config: {
      ip: connectionInfo.config.ip,
      port: connectionInfo.config.port,
      resourcePath: connectionInfo.config.resourcePath,
      securityMode:
        connectionInfo.securityMode || connectionInfo.config.securityMode,
      securityPolicy:
        connectionInfo.securityPolicy || connectionInfo.config.securityPolicy,
    },
    details: connectionInfo.details,
    lastUpdated: connectionInfo.lastUpdated,
  });
});

router.post(
  "/connect",
  validateBody(opcuaConnectionSchema),
  async (req: Request, res: Response) => {
    try {
      const { ip, port, resourcePath, securityMode, securityPolicy } = req.body;

      const normalizedPath =
        typeof resourcePath === "string"
          ? resourcePath.trim() === "" || resourcePath.trim() === "/"
            ? ""
            : resourcePath.trim().startsWith("/")
              ? resourcePath.trim()
              : `/${resourcePath.trim()}`
          : "";

      const newConfig = {
        ip,
        port,
        resourcePath: normalizedPath,
        securityMode: securityMode || "None",
        securityPolicy: securityPolicy || "None",
      };

      const updatedConfig =
        await opcuaConnectionManager.updateConnection(newConfig);

      res.json({
        message: "OPC UA connection reinitialized",
        config: updatedConfig,
        securityMode: newConfig.securityMode,
        securityPolicy: newConfig.securityPolicy,
      });
    } catch (error: any) {
      logger.error("Error in OPC UA connect endpoint:", error);
      res.status(500).json({
        error: "Connection failed",
        message: error.message,
        config: opcuaConnectionManager.getConnectionInfo().config,
      });
    }
  },
);

router.post("/disconnect", async (req: Request, res: Response) => {
  try {
    await opcuaConnectionManager.disconnectConnection();
    res.json({ message: "OPC UA connection disconnected" });
  } catch (error: any) {
    logger.error("Error in OPC UA disconnect endpoint:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/security-options", (req: Request, res: Response) => {
  try {
    const securityOptions = opcuaConnectionManager.getSecurityOptions();
    const connectionInfo = opcuaConnectionManager.getConnectionInfo();

    res.json({
      securityModes: securityOptions.securityModes,
      securityPolicies: securityOptions.securityPolicies,
      current: {
        securityMode:
          connectionInfo.securityMode || connectionInfo.config.securityMode,
        securityPolicy:
          connectionInfo.securityPolicy || connectionInfo.config.securityPolicy,
        ip: connectionInfo.config.ip,
        port: connectionInfo.config.port,
        resourcePath: connectionInfo.config.resourcePath,
      },
    });
  } catch (error: any) {
    logger.error("Error getting security options:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post(
  "/accept-certificate/:filename",
  async (req: Request, res: Response) => {
    try {
      const filename = req.params.filename as string;

      if (!filename) {
        res.status(400).json({
          error: "Invalid request",
          message: "Certificate filename is required",
        });
        return;
      }

      logger.info(`Accepting certificate: ${filename}`);
      const result = await opcuaConnectionManager.acceptCertificate(filename);

      if (result) {
        res.json({
          success: true,
          message: "Certificate accepted successfully",
        });

        setTimeout(() => {
          opcuaConnectionManager.startConnection().catch((err) => {
            logger.error(
              "Error reconnecting after certificate acceptance:",
              err,
            );
          });
        }, 1000);
      } else {
        res.status(500).json({
          success: false,
          error: "Failed to accept certificate",
        });
      }
    } catch (error: any) {
      logger.error("Error accepting certificate:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

router.post(
  "/test-connection",
  validateBody(opcuaConnectionSchema),
  async (req: Request, res: Response) => {
    try {
      const { ip, port, resourcePath, securityMode, securityPolicy } = req.body;

      logger.info(
        `Testing connection to OPC UA server: ${ip}:${port}${resourcePath} with SecurityMode=${securityMode}, SecurityPolicy=${securityPolicy}`,
      );

      const endpointUrl = `opc.tcp://${ip}:${port}${resourcePath}`;
      const securityOptions = { securityMode, securityPolicy };

      const connectionPromise = opcuaConnectionManager.getConnectionPromise(
        endpointUrl,
        securityOptions,
      );
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("Connection test timeout after 10 seconds")),
          10000,
        );
      });

      const connectionResult = await Promise.race([
        connectionPromise,
        timeoutPromise,
      ]);

      if (connectionResult) {
        if (connectionResult.session) await connectionResult.session.close();
        if (connectionResult.client) await connectionResult.client.disconnect();

        res.json({
          success: true,
          message: "Connection test successful",
          securityMode: connectionResult.securityMode,
          securityPolicy: connectionResult.securityPolicy,
        });
      } else {
        throw new Error("Connection test failed - null connection");
      }
    } catch (error: any) {
      logger.error("Error testing OPC UA connection:", error);
      res.status(500).json({
        success: false,
        error: "Connection test failed",
        message: error.message,
      });
    }
  },
);

export default router;
