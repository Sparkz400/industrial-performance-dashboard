import { X509Certificate } from "node:crypto";
import {
  validateMachineSecurity,
  validateCertificate,
} from "../../services/machineIdentity.js";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { OPCUACertificateManager } from "node-opcua-certificate-manager";
import * as opcua from "node-opcua";
import logger from "../../utils/logger.js";
import os from "os";

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
  fingerprint: string;
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number;
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
          automaticallyAcceptUnknownCertificate: false,
        });
        await this.certManager.initialize();
        logger.info(`OPCUACertificateManager initialized.`);

        const certExists = await exists(this.certificateFile);
        const keyExists = await exists(this.privateKeyFile);

        if (!certExists || !keyExists) {
          logger.info(
            "Client certificate or private key missing, creating new ones...",
          );
          await this.generateClientCertificate();
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
    return this.generateClientCertificate();
  }

  private async generateClientCertificate(): Promise<ClientCertificateResult> {
    if (
      !this.certManager ||
      !this.certificateFile ||
      !this.privateKeyFile ||
      !this.applicationUri
    ) {
      throw new Error("Certificate storage is not initialized");
    }
    await this.certManager.createSelfSignedCertificate({
      outputFile: this.certificateFile,
      applicationUri: this.applicationUri,
      subject: {
        commonName: this.applicationName,
        organization: this.organizationName,
        locality: this.localityName,
        state: this.stateName,
        country: this.countryName,
      },
      dns: [os.hostname(), "localhost"],
      ip: this.getIpAddresses(),
      startDate: new Date(),
      validity: 365,
    });
    return {
      certificateFile: this.certificateFile,
      privateKeyFile: this.privateKeyFile,
      applicationUri: this.applicationUri,
    };
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

      const parsed = new X509Certificate(certificate);
      validateCertificate(parsed);
      await this.certManager!.trustCertificate(parsed.raw);
      const certificates = await this.getTrustedCertificates();
      const filepath = certificates.find(
        (item) => item.fingerprint === parsed.fingerprint256,
      )?.path;
      if (!filepath) throw new Error("Trusted certificate was not persisted");
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
            const parsed = new X509Certificate(content);
            certificates.push({
              fingerprint: parsed.fingerprint256,
              subject: parsed.subject,
              issuer: parsed.issuer,
              validFrom: new Date(parsed.validFrom).toISOString(),
              validTo: new Date(parsed.validTo).toISOString(),
              daysRemaining: Math.floor(
                (Date.parse(parsed.validTo) - Date.now()) / 86400000,
              ),
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
    const safeFilename = path.basename(filename);
    if (
      safeFilename !== filename ||
      !/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*\.(pem|der)$/i.test(safeFilename)
    ) {
      throw new Error("Invalid certificate filename");
    }
    await this.ensureInitialized();
    try {
      if (!this.certManager) await this.ensureInitialized();

      const rejectedPath = path.join(this.rejectedDir!, safeFilename);
      const certificate = await readFile(rejectedPath);
      const trustedPath = await this.trustCertificate(
        certificate,
        safeFilename,
      );
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
  ): Promise<opcua.OPCUAClientOptions> {
    await this.ensureInitialized();
    try {
      if (!this.certManager) await this.ensureInitialized();

      const baseOptions: opcua.OPCUAClientOptions = {
        applicationName: this.applicationName,
        applicationUri: this.applicationUri!,
        connectionStrategy: {
          initialDelay: 1000,
          maxRetry: 3,
          maxDelay: 10 * 1000,
        },
        endpointMustExist: false,
        keepSessionAlive: true,
        requestedSessionTimeout: 60000,
      };

      validateMachineSecurity(securityMode, securityPolicy);

      if (securityMode === "None") {
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

      const finalMode =
        MessageSecurityMode[securityMode as keyof typeof MessageSecurityMode];
      const finalPolicy =
        SecurityPolicy[securityPolicy as keyof typeof SecurityPolicy];

      logger.info(
        `Using SecurityMode=${securityMode} and SecurityPolicy=${securityPolicy}`,
      );

      return {
        ...baseOptions,
        securityMode: finalMode,
        securityPolicy: finalPolicy,
        certificateFile: this.certificateFile!,
        privateKeyFile: this.privateKeyFile!,
        clientCertificateManager: this.certManager!,
      };
    } catch (error) {
      logger.error("Failed to get client options:", error);
      throw error;
    }
  }

  getAvailableSecurityPolicies(): string[] {
    return [
      "None",
      "Basic256Sha256",
      "Aes128_Sha256_RsaOaep",
      "Aes256_Sha256_RsaPss",
    ];
  }

  async dispose(): Promise<void> {
    await this.certManager?.dispose();
    this.certManager = null;
    this.isInitialized = false;
    this._initializePromise = null;
  }

  getAvailableSecurityModes(): string[] {
    return Object.keys(MessageSecurityMode).filter(
      (mode) => mode !== "Invalid" && isNaN(Number(mode)),
    );
  }
}

export default new CertificateManagerService();
