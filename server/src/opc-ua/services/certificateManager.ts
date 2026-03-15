import fs from "fs";
import path from "path";
import { promisify } from "util";
import { OPCUACertificateManager } from "node-opcua-certificate-manager";
import opcua from "node-opcua";
import logger from "../../utils/logger.js";
import os from "os";
import crypto from "crypto";
import config from "../../config/config.js";

const { SecurityPolicy, MessageSecurityMode } = opcua;

// Promisify fs functions
const exists = promisify(fs.exists);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
const unlink = promisify(fs.unlink);

export interface CertificateInfo {
  name: string;
  path: string;
  content: string;
}

export interface ClientCertificateResult {
  certificateFile: string;
  privateKeyFile: string;
  applicationUri: string;
}

/**
 * Certificate Manager class to handle OPC UA certificate operations
 */
class CertificateManagerService {
  applicationName: string;
  organizationName: string;
  countryName: string;
  localityName: string;
  stateName: string;
  pkiDir: string | null;
  certificatesDir: string | null;
  privateKeyDir: string | null;
  trustedDir: string | null;
  rejectedDir: string | null;
  issuerDir: string | null;
  certificateFile: string | null;
  privateKeyFile: string | null;
  applicationUri: string | null;
  certManager: OPCUACertificateManager | null;
  isInitialized: boolean;
  _initializePromise: Promise<void> | null;

  constructor() {
    this.applicationName = config.OPCUA_APPLICATION_NAME;
    this.organizationName = config.OPCUA_CERT_ORG_NAME;
    this.countryName = config.OPCUA_CERT_COUNTRY;
    this.localityName = config.OPCUA_CERT_LOCALITY;
    this.stateName = config.OPCUA_CERT_STATE;

    this.pkiDir = null;
    this.certificatesDir = null;
    this.privateKeyDir = null;
    this.trustedDir = null;
    this.rejectedDir = null;
    this.issuerDir = null;
    this.certificateFile = null;
    this.privateKeyFile = null;
    this.applicationUri = null;
    this.certManager = null;
    this.isInitialized = false;
    this._initializePromise = null;
  }

  ensureInitialized(): Promise<void> {
    if (this.isInitialized) {
      return Promise.resolve();
    }
    if (this._initializePromise) {
      return this._initializePromise;
    }

    this._initializePromise = (async () => {
      try {
        logger.info("Initializing Certificate Manager...");

        const customPkiDir = config.OPCUA_PKI_DIR;
        const defaultPkiDir = this.getDefaultPkiDir();
        this.pkiDir = await this.resolveBaseDir(defaultPkiDir, customPkiDir);

        this.certificatesDir = path.join(this.pkiDir, "own", "certs");
        this.privateKeyDir = path.join(this.pkiDir, "own", "private");
        this.trustedDir = path.join(this.pkiDir, "trusted", "certs");
        this.rejectedDir = path.join(this.pkiDir, "rejected", "certs");
        this.issuerDir = path.join(this.pkiDir, "issuer", "certs");
        this.certificateFile = path.join(
          this.certificatesDir,
          "client_certificate.pem",
        );
        this.privateKeyFile = path.join(this.privateKeyDir, "private_key.pem");

        const hostname = os.hostname();
        this.applicationUri = `urn:${hostname}:${this.applicationName}`;
        logger.info(`Using ApplicationURI: ${this.applicationUri}`);
        logger.info(`Using PKI directory: ${this.pkiDir}`);

        await this.ensureDirectoryExists(this.pkiDir);
        await this.ensureDirectoryExists(this.certificatesDir);
        await this.ensureDirectoryExists(this.privateKeyDir);
        await this.ensureDirectoryExists(this.trustedDir);
        await this.ensureDirectoryExists(this.rejectedDir);
        await this.ensureDirectoryExists(this.issuerDir);

        this.certManager = new OPCUACertificateManager({
          rootFolder: this.pkiDir,
          automaticallyAcceptUnknownCertificate:
            config.AUTO_ACCEPT_CERTIFICATES,
        });
        await this.certManager.initialize();
        logger.info(`OPCUACertificateManager initialized.`);

        const certExists = await exists(this.certificateFile);
        const keyExists = await exists(this.privateKeyFile);

        if (!certExists || !keyExists) {
          logger.info(
            "Client certificate or private key missing, creating new ones...",
          );
          await this.createClientCertificate();
        } else {
          logger.info(`Client certificate found: ${this.certificateFile}`);
          logger.info(`Client private key found: ${this.privateKeyFile}`);
        }

        this.isInitialized = true;
        logger.info("Certificate Manager initialization complete.");
      } catch (error) {
        logger.error("Failed to initialize Certificate Manager:", error);
        this.isInitialized = false;
        this.certManager = null;
        this._initializePromise = null;
        throw error;
      }
    })();

    return this._initializePromise;
  }

  getDefaultPkiDir(): string {
    if (process.platform === "win32") {
      return path.join(
        os.homedir(),
        "AppData",
        "Roaming",
        "node-opcua-default-nodejs",
        "Config",
        "PKI",
      );
    } else if (process.platform === "darwin") {
      return path.join(
        os.homedir(),
        "Library",
        "Application Support",
        "node-opcua-default-nodejs",
        "Config",
        "PKI",
      );
    } else {
      return path.join(
        os.homedir(),
        ".config",
        "node-opcua-default-nodejs",
        "Config",
        "PKI",
      );
    }
  }

  async resolveBaseDir(
    defaultPkiDir: string,
    customPkiDir?: string,
  ): Promise<string> {
    if (customPkiDir) {
      logger.info(`Custom PKI directory specified: ${customPkiDir}`);
      return customPkiDir;
    }
    try {
      const defaultDirExists = await exists(defaultPkiDir);
      if (defaultDirExists) {
        logger.info(`Using default node-opcua PKI directory: ${defaultPkiDir}`);
        return defaultPkiDir;
      } else {
        const localPath = path.join(process.cwd(), "certificates");
        logger.info(
          `Default PKI directory not found. Using local path: ${localPath}`,
        );
        return localPath;
      }
    } catch (error) {
      logger.error(
        `Error checking default PKI directory (${defaultPkiDir}):`,
        error,
      );
      const fallbackPath = path.join(process.cwd(), "certificates_fallback");
      logger.warn(
        `Falling back to local PKI directory due to error: ${fallbackPath}`,
      );
      return fallbackPath;
    }
  }

  async ensureDirectoryExists(dir: string): Promise<void> {
    if (typeof dir !== "string" || dir.trim() === "") {
      throw new TypeError(
        `Invalid path provided to ensureDirectoryExists: ${dir}`,
      );
    }
    try {
      await fs.promises.mkdir(dir, { recursive: true });
    } catch (error: any) {
      if (error.code !== "EEXIST") {
        logger.error(`Failed to ensure directory exists (${dir}):`, error);
        throw error;
      }
    }
  }

  async createClientCertificate(): Promise<ClientCertificateResult> {
    await this.ensureInitialized();

    logger.info("[CertMgr:createClientCert] Starting creation...");
    const creationPromise = (async (): Promise<ClientCertificateResult> => {
      try {
        const { pki, md } = await import("node-forge");

        const keys = pki.rsa.generateKeyPair(2048);
        const cert = pki.createCertificate();

        cert.publicKey = keys.publicKey;
        cert.serialNumber = crypto.randomBytes(16).toString("hex");
        cert.validity.notBefore = new Date();
        cert.validity.notAfter = new Date();
        cert.validity.notAfter.setFullYear(
          cert.validity.notBefore.getFullYear() + 5,
        );

        const subjectAttrs = [
          { name: "commonName", value: this.applicationName },
          { name: "organizationName", value: this.organizationName },
          { name: "localityName", value: this.localityName },
          { name: "stateOrProvinceName", value: this.stateName },
          { name: "countryName", value: this.countryName },
        ];
        cert.setSubject(subjectAttrs);
        cert.setIssuer(subjectAttrs);

        const hostname = os.hostname();
        const ipAddresses = this.getIpAddresses();
        const altNames: Array<{ type: number; value?: string; ip?: string }> = [
          { type: 6, value: this.applicationUri! },
          { type: 2, value: hostname },
          { type: 2, value: "localhost" },
        ];
        ipAddresses.forEach((ip) => {
          altNames.push({ type: 7, ip: ip });
        });

        cert.setExtensions([
          { name: "basicConstraints", cA: false },
          {
            name: "keyUsage",
            digitalSignature: true,
            keyEncipherment: true,
            dataEncipherment: true,
          },
          { name: "extKeyUsage", serverAuth: true, clientAuth: true },
          { name: "subjectAltName", altNames: altNames },
          { name: "subjectKeyIdentifier" },
        ]);

        cert.sign(keys.privateKey, md.sha256.create());

        const certPem = pki.certificateToPem(cert);
        const privateKeyPem = pki.privateKeyToPem(keys.privateKey);

        await Promise.all([
          writeFile(this.certificateFile!, certPem),
          writeFile(this.privateKeyFile!, privateKeyPem),
        ]);

        logger.info("[CertMgr:createClientCert] Files written successfully.");
        return {
          certificateFile: this.certificateFile!,
          privateKeyFile: this.privateKeyFile!,
          applicationUri: this.applicationUri!,
        };
      } catch (error: any) {
        logger.error(
          `[CertMgr:createClientCert] Failed during generation/write: ${error.message}`,
          { stack: error.stack },
        );
        throw error;
      }
    })();

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () =>
          reject(new Error("Certificate creation timed out after 45 seconds")),
        45000,
      );
    });

    try {
      const result = await Promise.race([creationPromise, timeoutPromise]);
      logger.info(
        "[CertMgr:createClientCert] Completed successfully (within timeout).",
      );
      return result;
    } catch (error: any) {
      logger.error(
        `[CertMgr:createClientCert] Failed or timed out: ${error.message}`,
      );
      throw error;
    }
  }

  getIpAddresses(): string[] {
    const ipAddresses: string[] = [];
    try {
      const networkInterfaces = os.networkInterfaces();
      Object.values(networkInterfaces).forEach((interfaces) => {
        interfaces?.forEach((iface) => {
          if (!iface.internal && iface.family === "IPv4") {
            ipAddresses.push(iface.address);
          }
        });
      });
    } catch (error) {
      logger.warn("Could not retrieve local IP addresses:", error);
    }
    if (!ipAddresses.includes("127.0.0.1")) {
      ipAddresses.push("127.0.0.1");
    }
    return ipAddresses;
  }

  async loadCertificates(): Promise<{
    certificate: Buffer;
    privateKey: Buffer;
  }> {
    await this.ensureInitialized();
    try {
      if (
        !(await exists(this.certificateFile!)) ||
        !(await exists(this.privateKeyFile!))
      ) {
        logger.warn(
          "Certificate or key not found during load, attempting to recreate...",
        );
        await this.createClientCertificate();
      }
      const certificate = await readFile(this.certificateFile!);
      const privateKey = await readFile(this.privateKeyFile!);
      return { certificate, privateKey };
    } catch (error: any) {
      logger.error("Failed to load certificates:", {
        file: this.certificateFile,
        key: this.privateKeyFile,
        error: error.message,
      });
      throw error;
    }
  }

  async trustCertificate(certificate: Buffer, name: string): Promise<string> {
    await this.ensureInitialized();
    try {
      if (!this.certManager) await this.ensureInitialized();

      const sanitizedName = name.replace(/[^a-z0-9._-]/gi, "_");
      const timestamp = Date.now();
      const filename = `${sanitizedName}_${timestamp}.pem`;
      const filepath = path.join(this.trustedDir!, filename);

      await writeFile(filepath, certificate);
      logger.info(`Added certificate to trusted list: ${filepath}`);
      return filepath;
    } catch (error: any) {
      logger.error("Failed to trust certificate:", {
        name,
        error: error.message,
      });
      throw error;
    }
  }

  async getTrustedCertificates(): Promise<CertificateInfo[]> {
    await this.ensureInitialized();
    return this._getCertificatesFromDir(this.trustedDir!, "trusted");
  }

  async getRejectedCertificates(): Promise<CertificateInfo[]> {
    await this.ensureInitialized();
    return this._getCertificatesFromDir(this.rejectedDir!, "rejected");
  }

  async _getCertificatesFromDir(
    dirPath: string,
    type: string,
  ): Promise<CertificateInfo[]> {
    const certificates: CertificateInfo[] = [];
    try {
      if (!this.certManager) await this.ensureInitialized();
      if (!(await exists(dirPath))) {
        logger.warn(`Certificate directory not found: ${dirPath}`);
        return [];
      }

      const files = await readdir(dirPath);
      for (const file of files) {
        if (file.endsWith(".pem") || file.endsWith(".der")) {
          const filepath = path.join(dirPath, file);
          try {
            const content = await readFile(filepath);
            certificates.push({
              name: file,
              path: filepath,
              content: content.toString("base64"),
            });
          } catch (readError) {
            logger.error(
              `Failed to read ${type} certificate file (${filepath}):`,
              readError,
            );
          }
        }
      }
    } catch (error) {
      logger.error(
        `Failed to get ${type} certificates from ${dirPath}:`,
        error,
      );
    }
    return certificates;
  }

  async acceptRejectedCertificate(filename: string): Promise<string> {
    await this.ensureInitialized();
    try {
      if (!this.certManager) await this.ensureInitialized();

      const rejectedPath = path.join(this.rejectedDir!, filename);
      const trustedPath = path.join(this.trustedDir!, filename);

      if (!(await exists(rejectedPath))) {
        throw new Error(`Rejected certificate not found: ${filename}`);
      }

      try {
        await promisify(fs.rename)(rejectedPath, trustedPath);
        logger.info(
          `Atomically moved certificate from rejected to trusted: ${filename}`,
        );
      } catch (renameError: any) {
        if (renameError.code === "EXDEV") {
          logger.warn(
            `Atomic rename failed (cross-device?), falling back to copy/delete for ${filename}`,
          );
          const certificate = await readFile(rejectedPath);
          await writeFile(trustedPath, certificate);
          await unlink(rejectedPath);
          logger.info(
            `Copied/deleted certificate from rejected to trusted: ${filename}`,
          );
        } else {
          throw renameError;
        }
      }

      return trustedPath;
    } catch (error: any) {
      logger.error("Failed to accept rejected certificate:", {
        filename,
        error: error.message,
      });
      throw error;
    }
  }

  async getClientOptions(
    securityMode: string = "None",
    securityPolicy: string = "None",
  ): Promise<Record<string, any>> {
    await this.ensureInitialized();
    try {
      if (!this.certManager) await this.ensureInitialized();

      const baseOptions: Record<string, any> = {
        applicationName: this.applicationName,
        applicationUri: this.applicationUri,
        connectionStrategy: {
          initialDelay: 1000,
          maxRetry: 3,
          maxDelay: 10 * 1000,
        },
        endpointMustExist: false,
        keepSessionAlive: true,
        requestedSessionTimeout: 60000,
      };

      const messageSecurityModeEnum = (MessageSecurityMode as any)[
        securityMode
      ];
      if (!messageSecurityModeEnum) {
        logger.warn(
          `Invalid security mode specified: ${securityMode}. Defaulting to None.`,
        );
        securityMode = "None";
      }

      const securityPolicyEnum = (SecurityPolicy as any)[securityPolicy];
      if (!securityPolicyEnum) {
        logger.warn(
          `Invalid security policy specified: ${securityPolicy}. Defaulting to None.`,
        );
        securityPolicy = "None";
      }

      if (securityMode === "None" || securityPolicy === "None") {
        logger.info(
          "Using SecurityMode=None and SecurityPolicy=None for client options.",
        );
        return {
          ...baseOptions,
          securityMode: MessageSecurityMode.None,
          securityPolicy: SecurityPolicy.None,
        };
      }

      if (
        !(await exists(this.certificateFile!)) ||
        !(await exists(this.privateKeyFile!))
      ) {
        logger.warn(
          "Secure connection requested but client certificate/key missing. Attempting to create...",
        );
        await this.createClientCertificate();
        if (
          !(await exists(this.certificateFile!)) ||
          !(await exists(this.privateKeyFile!))
        ) {
          throw new Error(
            "Client certificate or private key missing and could not be created. Cannot establish secure connection.",
          );
        }
      }

      logger.info(
        `Using SecurityMode=${securityMode} (${messageSecurityModeEnum.key}) and SecurityPolicy=${securityPolicy} (${securityPolicyEnum.key})`,
      );

      return {
        ...baseOptions,
        securityMode: messageSecurityModeEnum,
        securityPolicy: securityPolicyEnum,
        certificateFile: this.certificateFile,
        privateKeyFile: this.privateKeyFile,
        trustedCertificateList: (this.certManager as any)
          .trustedCertificateList,
        rejectedCertificateList: (this.certManager as any)
          .rejectedCertificateList,
        serverCertificateManager: this.certManager,
      };
    } catch (error) {
      logger.error("Failed to get client options:", error);
      throw error;
    }
  }

  getAvailableSecurityPolicies(): string[] {
    return Object.keys(SecurityPolicy)
      .filter(
        (policy) =>
          policy !== "Invalid" &&
          policy !== "PubSub_Aes128_CTR" &&
          typeof (SecurityPolicy as any)[policy] === "object" &&
          (SecurityPolicy as any)[policy].key !==
            (SecurityPolicy as any).Invalid.key,
      )
      .map((policy) => (SecurityPolicy as any)[policy].key);
  }

  getAvailableSecurityModes(): string[] {
    return Object.keys(MessageSecurityMode)
      .filter(
        (mode) =>
          mode !== "Invalid" &&
          typeof (MessageSecurityMode as any)[mode] === "object" &&
          (MessageSecurityMode as any)[mode].key !==
            (MessageSecurityMode as any).Invalid.key,
      )
      .map((mode) => (MessageSecurityMode as any)[mode].key);
  }
}

export default new CertificateManagerService();
