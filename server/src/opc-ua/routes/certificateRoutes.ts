import express, { type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import logger from "../../utils/logger.js";
import certificateManager from "../services/certificateManager.js";
import opcuaConnectionManager from "../services/opcuaConnectionManager.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requireRole } from "../../middleware/auth.js";
import {
  AppError,
  NotFoundError,
  ValidationError,
} from "../../utils/errors.js";

const router = express.Router();

const ensureCertificatesInitialized = asyncHandler(
  async (req: Request, res: Response, next) => {
    await certificateManager.ensureInitialized();
    next();
  },
);

router.use(ensureCertificatesInitialized);

router.get(
  "/trusted",
  asyncHandler(async (req: Request, res: Response) => {
    const trustedCerts = await certificateManager.getTrustedCertificates();
    res.json(trustedCerts);
  }),
);

router.get(
  "/rejected",
  asyncHandler(async (req: Request, res: Response) => {
    const rejectedCerts = await certificateManager.getRejectedCertificates();
    res.json(rejectedCerts);
  }),
);

router.post(
  "/trust",
  requireRole("admin"),
  asyncHandler(async (req: Request, res: Response) => {
    const { certificate, name } = req.body;

    if (!certificate || !name) {
      throw new ValidationError("Certificate and name are required");
    }

    const certBuffer = Buffer.from(certificate, "base64");
    const filepath = await certificateManager.trustCertificate(
      certBuffer,
      name,
    );

    res.json({ message: "Certificate trusted successfully", filepath });
  }),
);

router.post(
  "/accept-rejected/:filename",
  requireRole("admin"),
  asyncHandler(async (req: Request, res: Response) => {
    const filename = req.params.filename as string;

    if (!filename) {
      throw new ValidationError("Filename is required");
    }

    const filepath =
      await certificateManager.acceptRejectedCertificate(filename);

    res.json({
      message: "Rejected certificate accepted successfully",
      filepath,
    });
  }),
);

router.post(
  "/regenerate",
  requireRole("admin"),
  asyncHandler(async (req: Request, res: Response) => {
    await certificateManager.createClientCertificate();
    res.json({ message: "Client certificate regenerated successfully" });
  }),
);

router.get(
  "/client",
  asyncHandler(async (req: Request, res: Response) => {
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
      throw new NotFoundError("Client certificate");
    }

    const certificate = await promisify(fs.readFile)(certificateFile, "utf8");

    res.json({
      certificate,
      certificatePath: certificateFile,
      privateKeyPath: privateKeyFile,
      hasPrivateKey: keyExists,
    });
  }),
);

router.get("/security-options", (req: Request, res: Response) => {
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
});

export default router;
