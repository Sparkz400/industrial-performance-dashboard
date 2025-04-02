const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { OPCUACertificateManager } = require('node-opcua-certificate-manager');
const { SecurityPolicy, MessageSecurityMode } = require('node-opcua'); // Import enums
const logger = require('../../utils/logger');
const os = require('os');
const crypto = require('crypto');

// Promisify fs functions
const mkdir = promisify(fs.mkdir);
const exists = promisify(fs.exists);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
const unlink = promisify(fs.unlink);

/**
 * Certificate Manager class to handle OPC UA certificate operations
 */
class CertificateManager {
    constructor() {
        // --- Path Configuration ---
        // Allow overriding the base PKI directory via environment variable
        const customPkiDir = process.env.OPCUA_PKI_DIR;
        let basePkiDir = customPkiDir || this.getDefaultPkiDir();

        // Check if the custom or default directory exists
        this.initializeBaseDir(basePkiDir, customPkiDir).then(resolvedPkiDir => {
            this.pkiDir = resolvedPkiDir;
            this.certificatesDir = path.join(this.pkiDir, 'own', 'certs');
            this.privateKeyDir = path.join(this.pkiDir, 'own', 'private');
            this.trustedDir = path.join(this.pkiDir, 'trusted', 'certs');
            this.rejectedDir = path.join(this.pkiDir, 'rejected', 'certs');
            this.issuerDir = path.join(this.pkiDir, 'issuer', 'certs');

            // Update certificate paths based on the resolved PKI directory
            this.certificateFile = path.join(this.certificatesDir, 'client_certificate.pem');
            // Standard practice is often private_key.pem for the private key
            this.privateKeyFile = path.join(this.privateKeyDir, 'private_key.pem');

            logger.info(`Using PKI directory: ${this.pkiDir}`);

            // Initialize the manager and ensure certs exist after paths are set
            this.initialize().catch(err => {
                logger.error("Delayed initialization failed:", err);
            });

        }).catch(err => {
            logger.error("Failed to resolve PKI base directory:", err);
            // Fallback to a local directory in case of error during async init
            this.pkiDir = path.join(process.cwd(), 'certificates_fallback');
            // Set other paths based on fallback... (similar logic as above)
            logger.warn(`Falling back to local PKI directory: ${this.pkiDir}`);
            this.initialize().catch(initErr => logger.error("Fallback initialization failed:", initErr));
        });
        // --- End Path Configuration ---


        // --- Certificate Subject Configuration ---
        this.applicationName = process.env.OPCUA_APPLICATION_NAME || 'NodeOPCUA-Client';
        this.organizationName = process.env.OPCUA_CERT_ORG_NAME || 'OpenSource';
        this.countryName = process.env.OPCUA_CERT_COUNTRY || 'US';
        this.localityName = process.env.OPCUA_CERT_LOCALITY || 'Somewhere';
        this.stateName = process.env.OPCUA_CERT_STATE || 'State';
        // --- End Certificate Subject Configuration ---

        this.applicationUri = null; // Will be set during initialization
        this.certManager = null; // Initialize later
    }

    /**
     * Gets the default PKI directory based on the OS.
     * @returns {string} The default PKI path.
     */
    getDefaultPkiDir() {
        if (process.platform === 'win32') {
            return path.join(os.homedir(), 'AppData', 'Roaming', 'node-opcua-default-nodejs', 'Config', 'PKI');
        } else if (process.platform === 'darwin') {
            return path.join(os.homedir(), 'Library', 'Application Support', 'node-opcua-default-nodejs', 'Config', 'PKI');
        } else {
            return path.join(os.homedir(), '.config', 'node-opcua-default-nodejs', 'Config', 'PKI'); // More standard Linux path
        }
    }

    /**
     * Checks if the preferred PKI directory exists, otherwise uses the default.
     * @param {string} defaultPkiDir - The OS-specific default path.
     * @param {string|null} customPkiDir - The path from the environment variable.
     * @returns {Promise<string>} The resolved PKI directory path.
     */
    async initializeBaseDir(defaultPkiDir, customPkiDir) {
        if (customPkiDir) {
            logger.info(`Custom PKI directory specified: ${customPkiDir}`);
            return customPkiDir; // Use custom path if provided
        }

        try {
            const defaultDirExists = await exists(defaultPkiDir);
            if (defaultDirExists) {
                logger.info(`Using default node-opcua PKI directory: ${defaultPkiDir}`);
                return defaultPkiDir;
            } else {
                logger.info(`Default PKI directory not found. Using local path: ${path.join(process.cwd(), 'certificates')}`);
                return path.join(process.cwd(), 'certificates'); // Fallback to local project dir
            }
        } catch (error) {
            logger.error(`Error checking default PKI directory (${defaultPkiDir}):`, error);
            logger.warn(`Falling back to local PKI directory due to error: ${path.join(process.cwd(), 'certificates')}`);
            return path.join(process.cwd(), 'certificates'); // Fallback on error
        }
    }


    /**
     * Initialize the certificate manager, creating necessary directories and the client cert if needed.
     * @returns {Promise<void>}
     */
    async initialize() {
        // This function might be called multiple times (constructor, getClientOptions), ensure idempotency
        if (this.certManager) {
            // logger.debug("Certificate Manager already initialized.");
            return;
        }

        try {
            const hostname = os.hostname();
            // Construct a compliant ApplicationURI
            this.applicationUri = `urn:${hostname}:${this.applicationName}`;
            logger.info(`Using ApplicationURI: ${this.applicationUri}`);

            // Ensure all necessary directories exist
            await this.ensureDirectoryExists(this.pkiDir);
            await this.ensureDirectoryExists(this.certificatesDir);
            await this.ensureDirectoryExists(this.privateKeyDir);
            await this.ensureDirectoryExists(this.trustedDir);
            await this.ensureDirectoryExists(this.rejectedDir);
            await this.ensureDirectoryExists(this.issuerDir);

            // Initialize the node-opcua certificate manager instance
            this.certManager = new OPCUACertificateManager({
                rootFolder: this.pkiDir,
                automaticallyAcceptUnknownCertificate: process.env.AUTO_ACCEPT_CERTIFICATES === 'true' // Configure auto-accept here
            });
            await this.certManager.initialize(); // Initialize the manager itself

            logger.info(`OPCUACertificateManager initialized for PKI root: ${this.pkiDir}`);

            // Check if certificate exists, create if it doesn't
            const certExists = await exists(this.certificateFile);
            const keyExists = await exists(this.privateKeyFile);

            if (!certExists || !keyExists) {
                logger.info("Client certificate or private key missing, creating new ones...");
                await this.createClientCertificate();
            } else {
                logger.info(`Client certificate found: ${this.certificateFile}`);
                logger.info(`Client private key found: ${this.privateKeyFile}`);
                // Optional: Validate existing certificate expiry?
            }
        } catch (error) {
            logger.error('Failed to initialize Certificate Manager:', error);
            this.certManager = null; // Ensure manager is null on failure
            throw error; // Re-throw to indicate initialization failure
        }
    }

    /**
     * Ensure directory exists, creating it if necessary. Includes error handling.
     * @param {string} dir - Directory path
     * @returns {Promise<void>}
     */
    async ensureDirectoryExists(dir) {
        try {
            if (!await exists(dir)) {
                await fs.promises.mkdir(dir, { recursive: true });
                logger.info(`Created directory: ${dir}`);
            }
        } catch (error) {
            logger.error(`Failed to ensure directory exists (${dir}):`, error);
            throw error; // Propagate the error
        }
    }

    /**
     * Create a new client certificate using the refined custom method.
     * @returns {Promise<Object>} Object containing certificate paths and URI.
     */
    async createClientCertificate() {
        try {
            logger.info('Creating new client certificate...');

            // Ensure certManager is initialized (might call initialize again, but it's idempotent)
            if (!this.certManager) await this.initialize();

            const hostname = os.hostname();
            const ipAddresses = this.getIpAddresses();

            // Use the applicationUri set during initialization
            const applicationUri = this.applicationUri;

            logger.info(`Certificate Details - Hostname: ${hostname}, AppURI: ${applicationUri}, IPs: ${ipAddresses.join(', ')}`);
            logger.info(`Subject - CN: ${this.applicationName}, O: ${this.organizationName}, C: ${this.countryName}`);

            // Use node-forge for certificate creation
            const { pki, md } = require('node-forge');
            const keys = pki.rsa.generateKeyPair(2048); // Generate keys using node-forge
            const cert = pki.createCertificate();

            cert.publicKey = keys.publicKey;
            cert.serialNumber = crypto.randomBytes(16).toString('hex');
            cert.validity.notBefore = new Date();
            cert.validity.notAfter = new Date();
            cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 5); // 5 year validity

            const subjectAttrs = [
                { name: 'commonName', value: this.applicationName },
                { name: 'organizationName', value: this.organizationName },
                { name: 'localityName', value: this.localityName },
                { name: 'stateOrProvinceName', value: this.stateName },
                { name: 'countryName', value: this.countryName }
            ];
            cert.setSubject(subjectAttrs);
            cert.setIssuer(subjectAttrs); // Self-signed

            const altNames = [
                { type: 6, value: applicationUri }, // URI
                { type: 2, value: hostname },       // DNS Name
                { type: 2, value: 'localhost' },    // DNS Name
            ];
            ipAddresses.forEach(ip => {
                altNames.push({ type: 7, ip: ip }); // IP Address
            });

            cert.setExtensions([
                { name: 'basicConstraints', cA: false }, // Not a CA
                { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, dataEncipherment: true },
                { name: 'extKeyUsage', serverAuth: true, clientAuth: true },
                { name: 'subjectAltName', altNames: altNames },
                { name: 'subjectKeyIdentifier' }
            ]);

            // Sign the certificate
            cert.sign(keys.privateKey, md.sha256.create());

            // Convert to PEM format
            const certPem = pki.certificateToPem(cert);
            const privateKeyPem = pki.privateKeyToPem(keys.privateKey);

            // --- Robust File Writing ---
            try {
                await writeFile(this.certificateFile, certPem);
                logger.info(`Client certificate written to: ${this.certificateFile}`);
            } catch (writeError) {
                logger.error(`Failed to write certificate file (${this.certificateFile}):`, writeError);
                throw writeError;
            }

            try {
                await writeFile(this.privateKeyFile, privateKeyPem);
                logger.info(`Client private key written to: ${this.privateKeyFile}`);
            } catch (writeError) {
                logger.error(`Failed to write private key file (${this.privateKeyFile}):`, writeError);
                // Attempt to clean up certificate file if key writing fails
                try { await unlink(this.certificateFile); } catch (cleanupError) { /* ignore */ }
                throw writeError;
            }
            // --- End Robust File Writing ---

            return {
                certificateFile: this.certificateFile,
                privateKeyFile: this.privateKeyFile,
                applicationUri: applicationUri
            };
        } catch (error) {
            logger.error(`Failed to create client certificate: ${error.message}`, { stack: error.stack });
            throw error; // Re-throw the error
        }
    }

    /**
     * Get local non-internal IPv4 addresses.
     * @returns {Array<string>} List of IP addresses.
     */
    getIpAddresses() {
        const ipAddresses = [];
        try {
            const networkInterfaces = os.networkInterfaces();
            Object.values(networkInterfaces).forEach(interfaces => {
                interfaces.forEach(iface => {
                    if (!iface.internal && iface.family === 'IPv4') {
                        ipAddresses.push(iface.address);
                    }
                });
            });
        } catch (error) {
            logger.warn("Could not retrieve local IP addresses:", error);
        }
        // Always include loopback
        if (!ipAddresses.includes('127.0.0.1')) {
            ipAddresses.push('127.0.0.1');
        }
        return ipAddresses;
    }


    /**
     * Load certificate and private key with error handling.
     * @returns {Promise<{certificate: Buffer, privateKey: Buffer}>}
     */
    async loadCertificates() {
        try {
            // Ensure manager is initialized and paths are set
            if (!this.certManager) await this.initialize();

            if (!await exists(this.certificateFile) || !await exists(this.privateKeyFile)) {
                logger.warn("Certificate or key not found during load, attempting to recreate...");
                await this.createClientCertificate(); // Attempt to recreate if missing
            }

            const certificate = await readFile(this.certificateFile);
            const privateKey = await readFile(this.privateKeyFile);

            return { certificate, privateKey };
        } catch (error) {
            logger.error('Failed to load certificates:', { file: this.certificateFile, key: this.privateKeyFile, error: error.message });
            throw error; // Re-throw for calling function to handle
        }
    }

    /**
     * Add a certificate to the trusted list with error handling.
     * @param {Buffer} certificate - The certificate to trust
     * @param {string} name - Name for the trusted certificate
     * @returns {Promise<string>} - Path to the trusted certificate
     */
    async trustCertificate(certificate, name) {
        try {
            if (!this.certManager) await this.initialize();

            const sanitizedName = name.replace(/[^a-z0-9._-]/gi, '_'); // Allow more chars
            const timestamp = Date.now();
            const filename = `${sanitizedName}_${timestamp}.pem`;
            const filepath = path.join(this.trustedDir, filename);

            await writeFile(filepath, certificate);
            logger.info(`Added certificate to trusted list: ${filepath}`);
            return filepath;
        } catch (error) {
            logger.error('Failed to trust certificate:', { name, error: error.message });
            throw error;
        }
    }

    /**
     * Get a list of all trusted certificates with content.
     * @returns {Promise<Array<Object>>} - List of trusted certificates { name, path, content (base64) }
     */
    async getTrustedCertificates() {
        return this._getCertificatesFromDir(this.trustedDir, 'trusted');
    }

    /**
     * Get a list of all rejected certificates with content.
     * @returns {Promise<Array<Object>>} - List of rejected certificates { name, path, content (base64) }
     */
    async getRejectedCertificates() {
        return this._getCertificatesFromDir(this.rejectedDir, 'rejected');
    }

    /**
     * Helper to read certificates from a directory.
     * @param {string} dirPath - Directory path.
     * @param {string} type - Type ('trusted' or 'rejected') for logging.
     * @returns {Promise<Array<Object>>} - List of certificates.
     */
    async _getCertificatesFromDir(dirPath, type) {
        const certificates = [];
        try {
            if (!this.certManager) await this.initialize();
            if (!await exists(dirPath)) {
                logger.warn(`Certificate directory not found: ${dirPath}`);
                return []; // Return empty if dir doesn't exist
            }

            const files = await readdir(dirPath);
            for (const file of files) {
                if (file.endsWith('.pem') || file.endsWith('.der')) { // Support DER too
                    const filepath = path.join(dirPath, file);
                    try {
                        const content = await readFile(filepath);
                        certificates.push({
                            name: file,
                            path: filepath,
                            content: content.toString('base64') // Send base64 to client
                        });
                    } catch (readError) {
                        logger.error(`Failed to read ${type} certificate file (${filepath}):`, readError);
                    }
                }
            }
        } catch (error) {
            logger.error(`Failed to get ${type} certificates from ${dirPath}:`, error);
            // Don't throw, return empty list or partial list if some files failed
        }
        return certificates;
    }


    /**
     * Move a certificate from rejected to trusted with error handling.
     * @param {string} filename - Name of the certificate file
     * @returns {Promise<string>} - Path to the trusted certificate
     */
    async acceptRejectedCertificate(filename) {
        try {
            if (!this.certManager) await this.initialize();

            const rejectedPath = path.join(this.rejectedDir, filename);
            const trustedPath = path.join(this.trustedDir, filename);

            if (!await exists(rejectedPath)) {
                throw new Error(`Rejected certificate not found: ${filename}`);
            }

            // Use rename for atomic move if possible, fallback to copy/delete
            try {
                await promisify(fs.rename)(rejectedPath, trustedPath);
                logger.info(`Atomically moved certificate from rejected to trusted: ${filename}`);
            } catch (renameError) {
                if (renameError.code === 'EXDEV') { // Cross-device link error
                    logger.warn(`Atomic rename failed (cross-device?), falling back to copy/delete for ${filename}`);
                    const certificate = await readFile(rejectedPath);
                    await writeFile(trustedPath, certificate);
                    await unlink(rejectedPath);
                    logger.info(`Copied/deleted certificate from rejected to trusted: ${filename}`);
                } else {
                    throw renameError; // Re-throw other rename errors
                }
            }

            return trustedPath;
        } catch (error) {
            logger.error('Failed to accept rejected certificate:', { filename, error: error.message });
            throw error;
        }
    }

    /**
     * Get OPCUA client options for certificate-based security.
     * @param {string} securityMode - The security mode ('None', 'Sign', 'SignAndEncrypt').
     * @param {string} securityPolicy - The security policy ('None', 'Basic256Sha256', etc.).
     * @returns {Promise<Object>} - Client options for node-opcua.
     */
    async getClientOptions(securityMode = 'None', securityPolicy = 'None') {
        try {
            // Ensure manager is initialized (sets applicationUri, checks certs)
            if (!this.certManager) await this.initialize();

            const baseOptions = {
                applicationName: this.applicationName,
                applicationUri: this.applicationUri,
                connectionStrategy: {
                    initialDelay: 1000,
                    maxRetry: 3, // Keep retries lower here, manager handles overall retry
                    maxDelay: 10 * 1000
                },
                endpointMustExist: false, // Recommended for flexibility
                keepSessionAlive: true,   // Keep session alive
                requestedSessionTimeout: 60000 // Request 60s timeout
            };

            // Map security mode string to enum safely
            const messageSecurityModeEnum = MessageSecurityMode[securityMode];
            if (!messageSecurityModeEnum) {
                logger.warn(`Invalid security mode specified: ${securityMode}. Defaulting to None.`);
                securityMode = 'None';
            }

            // Map security policy string to enum safely
            const securityPolicyEnum = SecurityPolicy[securityPolicy];
            if (!securityPolicyEnum) {
                logger.warn(`Invalid security policy specified: ${securityPolicy}. Defaulting to None.`);
                securityPolicy = 'None';
            }

            // Handle 'None' security case
            if (securityMode === 'None' || securityPolicy === 'None') {
                logger.info("Using SecurityMode=None and SecurityPolicy=None for client options.");
                return {
                    ...baseOptions,
                    securityMode: MessageSecurityMode.None,
                    securityPolicy: SecurityPolicy.None,
                };
            }

            // For secure connections, ensure certs/keys exist
            if (!await exists(this.certificateFile) || !await exists(this.privateKeyFile)) {
                logger.warn("Secure connection requested but client certificate/key missing. Attempting to create...");
                await this.createClientCertificate(); // Attempt creation
                // Re-check after creation attempt
                if (!await exists(this.certificateFile) || !await exists(this.privateKeyFile)) {
                    throw new Error("Client certificate or private key missing and could not be created. Cannot establish secure connection.");
                }
            }

            logger.info(`Using SecurityMode=${securityMode} (${messageSecurityModeEnum.key}) and SecurityPolicy=${securityPolicy} (${securityPolicyEnum.key})`);

            return {
                ...baseOptions,
                securityMode: messageSecurityModeEnum,
                securityPolicy: securityPolicyEnum,
                certificateFile: this.certificateFile,
                privateKeyFile: this.privateKeyFile,
                // Use the initialized certManager's properties for trust/rejection
                trustedCertificateList: this.certManager.trustedCertificateList,
                rejectedCertificateList: this.certManager.rejectedCertificateList,
                // Let the manager handle trust decisions based on folders
                serverCertificateManager: this.certManager
            };
        } catch (error) {
            logger.error('Failed to get client options:', error);
            throw error; // Re-throw to be handled by the connection manager
        }
    }

    /**
     * Get available security policies from node-opcua enum.
     * @returns {Array<string>} - List of available security policy keys.
     */
    getAvailableSecurityPolicies() {
        // Filter out None and invalid policies
        return Object.keys(SecurityPolicy)
            .filter(policy =>
                policy !== 'Invalid' &&
                policy !== 'PubSub_Aes128_CTR' && // Example filter if needed
                typeof SecurityPolicy[policy] === 'object' && // Enum members are objects
                SecurityPolicy[policy].key !== SecurityPolicy.Invalid.key // Check key
            )
            .map(policy => SecurityPolicy[policy].key); // Return the key string e.g., "Basic256Sha256"
    }

    /**
     * Get available security modes from node-opcua enum.
     * @returns {Array<string>} - List of available security mode keys.
     */
    getAvailableSecurityModes() {
        // Filter out Invalid mode
        return Object.keys(MessageSecurityMode)
            .filter(mode =>
                mode !== 'Invalid' &&
                typeof MessageSecurityMode[mode] === 'object' && // Enum members are objects
                MessageSecurityMode[mode].key !== MessageSecurityMode.Invalid.key // Check key
            )
            .map(mode => MessageSecurityMode[mode].key); // Return the key string e.g., "SignAndEncrypt"
    }
}

// Export singleton instance
module.exports = new CertificateManager();