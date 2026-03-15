import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import logger from "../../utils/logger.js";
import certificateManager from "../services/certificateManager.js";
import opcuaConnectionManager from "../services/opcuaConnectionManager.js";

const router = express.Router();

const ensureCertificatesInitialized = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await certificateManager.ensureInitialized();
    next();
  } catch (error: any) {
    logger.error("Error initializing certificates:", error);
    res.status(500).json({
      error: "Failed to initialize certificates",
      message: error.message,
    });
  }
};

router.use(ensureCertificatesInitialized);

router.get("/trusted", async (req: Request, res: Response) => {
  try {
    const trustedCerts = await certificateManager.getTrustedCertificates();
    res.json(trustedCerts);
  } catch (error: any) {
    logger.error("Error getting trusted certificates:", error);
    res.status(500).json({
      error: "Failed to get trusted certificates",
      message: error.message,
    });
  }
});

router.get("/rejected", async (req: Request, res: Response) => {
  try {
    const rejectedCerts = await certificateManager.getRejectedCertificates();
    res.json(rejectedCerts);
  } catch (error: any) {
    logger.error("Error getting rejected certificates:", error);
    res.status(500).json({
      error: "Failed to get rejected certificates",
      message: error.message,
    });
  }
});

router.post("/trust", async (req: Request, res: Response) => {
  try {
    const { certificate, name } = req.body;

    if (!certificate || !name) {
      res.status(400).json({
        error: "Invalid request",
        message: "Certificate and name are required",
      });
      return;
    }

    const certBuffer = Buffer.from(certificate, "base64");
    const filepath = await certificateManager.trustCertificate(
      certBuffer,
      name,
    );

    res.json({
      message: "Certificate trusted successfully",
      filepath,
    });
  } catch (error: any) {
    logger.error("Error trusting certificate:", error);
    res.status(500).json({
      error: "Failed to trust certificate",
      message: error.message,
    });
  }
});

router.post(
  "/accept-rejected/:filename",
  async (req: Request, res: Response) => {
    try {
      const filename = req.params.filename as string;

      if (!filename) {
        res.status(400).json({
          error: "Invalid request",
          message: "Filename is required",
        });
        return;
      }

      const filepath =
        await certificateManager.acceptRejectedCertificate(filename);

      res.json({
        message: "Rejected certificate accepted successfully",
        filepath,
      });
    } catch (error: any) {
      logger.error("Error accepting rejected certificate:", error);
      res.status(500).json({
        error: "Failed to accept rejected certificate",
        message: error.message,
      });
    }
  },
);

router.post("/regenerate", async (req: Request, res: Response) => {
  try {
    await certificateManager.createClientCertificate();

    res.json({
      message: "Client certificate regenerated successfully",
    });
  } catch (error: any) {
    logger.error("Error regenerating client certificate:", error);
    res.status(500).json({
      error: "Failed to regenerate client certificate",
      message: error.message,
    });
  }
});

router.get("/client", async (req: Request, res: Response) => {
  try {
    const certificateFile = path.join(
      certificateManager.certificatesDir!,
      "client_certificate.pem",
    );
    const privateKeyFile = path.join(
      certificateManager.certificatesDir!,
      "client_private_key.pem",
    );

    const [certExists, keyExists] = await Promise.all([
      fs.promises.access(certificateFile).then(
        () => true,
        () => false,
      ),
      fs.promises.access(privateKeyFile).then(
        () => true,
        () => false,
      ),
    ]);

    if (!certExists || !keyExists) {
      res.status(404).json({
        error: "Client certificate not found",
        message: "Please generate a client certificate first",
      });
      return;
    }

    const certificate = await promisify(fs.readFile)(certificateFile, "utf8");

    res.json({
      certificate,
      certificatePath: certificateFile,
      privateKeyPath: privateKeyFile,
      hasPrivateKey: keyExists,
    });
  } catch (error: any) {
    logger.error("Error getting client certificate:", error);
    res.status(500).json({
      error: "Failed to get client certificate",
      message: error.message,
    });
  }
});

router.get("/security-options", (req: Request, res: Response) => {
  try {
    const securityOptions = opcuaConnectionManager.getSecurityOptions();
    const connectionInfo = opcuaConnectionManager.getConnectionInfo();

    res.json({
      ...securityOptions,
      current: {
        securityMode:
          connectionInfo.securityMode || connectionInfo.config.securityMode,
        securityPolicy:
          connectionInfo.securityPolicy || connectionInfo.config.securityPolicy,
      },
    });
  } catch (error: any) {
    logger.error("Error getting security options:", error);
    res.status(500).json({
      error: "Failed to get security options",
      message: error.message,
    });
  }
});

export default router;
