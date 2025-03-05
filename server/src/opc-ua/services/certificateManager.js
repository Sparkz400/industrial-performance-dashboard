const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { OPCUACertificateManager } = require('node-opcua-certificate-manager');
const { SecurityPolicy } = require('node-opcua');
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
        // Use proper path.join for platform compatibility
        this.pkiDir = process.env.OPCUA_PKI_DIR || path.join(process.cwd(), 'certificates');
        this.certificatesDir = path.join(this.pkiDir, 'own', 'certs');
        this.privateKeyDir = path.join(this.pkiDir, 'own', 'private');
        this.trustedDir = path.join(this.pkiDir, 'trusted', 'certs');
        this.rejectedDir = path.join(this.pkiDir, 'rejected', 'certs');
        this.issuerDir = path.join(this.pkiDir, 'issuer', 'certs');

        // Certificate details
        this.applicationName = process.env.OPCUA_APPLICATION_NAME || 'Monitoring Dashboard Client';
        this.applicationUri = null; // Will be set during initialization
        this.certificateFile = path.join(this.certificatesDir, 'client_certificate.pem');
        this.privateKeyFile = path.join(this.privateKeyDir, 'client_private_key.pem');

        // Certificate manager instance
        this.certManager = null;
    }

    /**
     * Initialize the certificate manager, creating necessary directories
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            // Get the operating system info for properly formatted application URI
            const hostname = os.hostname();

            // Set application URI based on hostname
            this.applicationUri = `urn:${hostname}:NodeOPCUA-Client`;

            logger.info(`Using application URI: ${this.applicationUri}`);

            // Check if node-opcua default certificate directory exists (platform-independent path)
            let defaultCertDir;

            if (process.platform === 'win32') {
                // Windows path
                defaultCertDir = path.join(os.homedir(), 'AppData', 'Roaming', 'node-opcua-default-nodejs', 'Config', 'PKI');
            } else if (process.platform === 'darwin') {
                // macOS path
                defaultCertDir = path.join(os.homedir(), 'Library', 'Application Support', 'node-opcua-default-nodejs', 'Config', 'PKI');
            } else {
                // Linux/Unix path
                defaultCertDir = path.join(os.homedir(), '.node-opcua-default-nodejs', 'Config', 'PKI');
            }

            // Check if the default directory exists
            const defaultDirExists = await exists(defaultCertDir);

            if (defaultDirExists) {
                logger.info(`Found default node-opcua certificate directory: ${defaultCertDir}`);

                // Use the default directory for certificates with platform-independent path joining
                this.pkiDir = defaultCertDir;
                this.certificatesDir = path.join(defaultCertDir, 'own', 'certs');
                this.privateKeyDir = path.join(defaultCertDir, 'own', 'private');
                this.trustedDir = path.join(defaultCertDir, 'trusted', 'certs');
                this.rejectedDir = path.join(defaultCertDir, 'rejected', 'certs');
                this.issuerDir = path.join(defaultCertDir, 'issuer', 'certs');

                // Update certificate paths
                this.certificateFile = path.join(this.certificatesDir, 'client_certificate.pem');
                this.privateKeyFile = path.join(this.privateKeyDir, 'private_key.pem');

                logger.info(`Using existing certificate directory: ${this.pkiDir}`);
            } else {
                logger.info(`Default node-opcua certificate directory not found. Creating our own at: ${this.pkiDir}`);
            }

            // Create necessary directories
            await this.ensureDirectoryExists(this.pkiDir);
            await this.ensureDirectoryExists(this.certificatesDir);
            await this.ensureDirectoryExists(this.privateKeyDir);
            await this.ensureDirectoryExists(this.trustedDir);
            await this.ensureDirectoryExists(this.rejectedDir);
            await this.ensureDirectoryExists(this.issuerDir);

            // Initialize certificate manager
            this.certManager = new OPCUACertificateManager({
                rootFolder: this.pkiDir
            });

            logger.info(`Certificate Manager initialized: ${this.pkiDir}`);

            // Check if certificate exists, create if it doesn't
            const certExists = await exists(this.certificateFile);
            const keyExists = await exists(this.privateKeyFile);

            if (!certExists || !keyExists) {
                logger.info("Client certificate or private key missing, creating new ones");
                await this.createClientCertificate();
            } else {
                logger.info(`Using existing client certificate: ${this.certificateFile}`);
            }
        } catch (error) {
            logger.error('Failed to initialize Certificate Manager:', error);
            throw error;
        }
    }

    /**
     * Ensure directory exists, creating it if necessary
     * @param {string} dir - Directory path
     * @returns {Promise<void>}
     */
    async ensureDirectoryExists(dir) {
        if (!await exists(dir)) {
            await mkdir(dir, { recursive: true });
            logger.info(`Created directory: ${dir}`);
        }
    }

    /**
     * Create a new client certificate
     * @returns {Promise<void>}
     */
    async createClientCertificate() {
        try {
            logger.info('Creating new client certificate with proper subjectAltName');

            // Get hostname and IP addresses for certificate
            const hostname = os.hostname();
            const networkInterfaces = os.networkInterfaces();

            // Collect all IP addresses
            const ipAddresses = [];
            Object.values(networkInterfaces).forEach(interfaces => {
                interfaces.forEach(iface => {
                    // Skip loopback and non-IPv4 addresses for now
                    if (!iface.internal && iface.family === 'IPv4') {
                        ipAddresses.push(iface.address);
                    }
                });
            });

            // Always add localhost
            ipAddresses.push('127.0.0.1');

            // Create application URI that matches the standard format
            const applicationName = "NodeOPCUA-Client";
            const applicationUri = `urn:${hostname}:${applicationName}`;

            logger.info(`Using hostname: ${hostname}`);
            logger.info(`Using applicationUri: ${applicationUri}`);
            logger.info(`Using IP addresses: ${ipAddresses.join(', ')}`);

            // Make sure certManager is initialized
            if (!this.certManager) {
                await this.initialize();
            }

            // Ensure output directories exist
            await this.ensureDirectoryExists(path.dirname(this.certificateFile));
            await this.ensureDirectoryExists(path.dirname(this.privateKeyFile));

            // Create certificate using direct node-opcua API to bypass issues
            // with the OPCUACertificateManager.createSelfSignedCertificate method
            const crypto = require("crypto");
            const { generateKeyPairSync } = require('crypto');
            const { pki, md } = require('node-forge');

            // Generate keypair using Node.js crypto
            const { privateKey, publicKey } = generateKeyPairSync('rsa', {
                modulusLength: 2048,
                publicKeyEncoding: {
                    type: 'spki',
                    format: 'pem'
                },
                privateKeyEncoding: {
                    type: 'pkcs8',
                    format: 'pem'
                }
            });

            // Create certificate using node-forge
            const cert = pki.createCertificate();
            cert.publicKey = pki.publicKeyFromPem(publicKey);

            // Set certificate attributes
            cert.serialNumber = crypto.randomBytes(16).toString('hex');
            cert.validity.notBefore = new Date();
            cert.validity.notAfter = new Date();
            cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 5);

            const attrs = [
                { name: 'commonName', value: applicationName },
                { name: 'organizationName', value: 'OpenSource' },
                { name: 'organizationalUnitName', value: 'Development' },
                { name: 'countryName', value: 'US' }
            ];

            cert.setSubject(attrs);
            cert.setIssuer(attrs); // Self-signed

            // Set extensions for OPC UA compliance
            cert.setExtensions([
                {
                    name: 'keyUsage',
                    digitalSignature: true,
                    nonRepudiation: true,
                    keyEncipherment: true,
                    dataEncipherment: true
                },
                {
                    name: 'extKeyUsage',
                    serverAuth: true,
                    clientAuth: true
                },
                {
                    name: 'subjectAltName',
                    altNames: [
                        { type: 6, value: this.applicationUri },
                        { type: 2, value: 'localhost' },
                        { type: 2, value: hostname },
                        { type: 7, ip: '127.0.0.1' }
                    ]
                },
                {
                    name: 'subjectKeyIdentifier'
                }
            ]);

            // Sign the certificate
            cert.sign(pki.privateKeyFromPem(privateKey), md.sha256.create());

            // Convert to PEM format
            const certPem = pki.certificateToPem(cert);

            // Write certificate and private key to files
            await writeFile(this.certificateFile, certPem);
            await writeFile(this.privateKeyFile, privateKey);

            logger.info(`Client certificate created successfully at: ${this.certificateFile}`);
            logger.info(`Private key saved to: ${this.privateKeyFile}`);

            // Update our applicationUri to match the one used in the certificate
            this.applicationUri = applicationUri;

            return {
                certificateFile: this.certificateFile,
                privateKeyFile: this.privateKeyFile,
                applicationUri: applicationUri
            };
        } catch (error) {
            logger.error(`Failed to create client certificate: ${error.message}`);
            logger.error(`Stack trace: ${error.stack}`);
            throw error;
        }
    }

    /**
     * Load certificate and private key
     * @returns {Promise<{certificate: Buffer, privateKey: Buffer}>}
     */
    async loadCertificates() {
        try {
            // Ensure certificates exist
            if (!await exists(this.certificateFile) || !await exists(this.privateKeyFile)) {
                await this.createClientCertificate();
            }

            // Read certificate and private key
            const certificate = await readFile(this.certificateFile);
            const privateKey = await readFile(this.privateKeyFile);

            return { certificate, privateKey };
        } catch (error) {
            logger.error('Failed to load certificates:', error);
            throw error;
        }
    }

    /**
     * Add a certificate to the trusted list
     * @param {Buffer} certificate - The certificate to trust
     * @param {string} name - Name for the trusted certificate
     * @returns {Promise<string>} - Path to the trusted certificate
     */
    async trustCertificate(certificate, name) {
        try {
            // Create a sanitized filename from the name
            const sanitizedName = name.replace(/[^a-z0-9]/gi, '_');
            const timestamp = Date.now();
            const randomPart = crypto.randomBytes(4).toString('hex');
            const filename = `${sanitizedName}_${timestamp}_${randomPart}.pem`;

            const filepath = path.join(this.trustedDir, filename);

            await writeFile(filepath, certificate);
            logger.info(`Added certificate to trusted list: ${filepath}`);

            return filepath;
        } catch (error) {
            logger.error('Failed to trust certificate:', error);
            throw error;
        }
    }

    /**
     * Get a list of all trusted certificates
     * @returns {Promise<Array<Object>>} - List of trusted certificates
     */
    async getTrustedCertificates() {
        try {
            const trustedCerts = [];
            const files = await readdir(this.trustedDir);

            for (const file of files) {
                if (file.endsWith('.pem')) {
                    const filepath = path.join(this.trustedDir, file);
                    const content = await readFile(filepath);

                    trustedCerts.push({
                        name: file,
                        path: filepath,
                        content: content.toString('base64')
                    });
                }
            }

            return trustedCerts;
        } catch (error) {
            logger.error('Failed to get trusted certificates:', error);
            throw error;
        }
    }

    /**
     * Get a list of all rejected certificates
     * @returns {Promise<Array<Object>>} - List of rejected certificates
     */
    async getRejectedCertificates() {
        try {
            const rejectedCerts = [];
            const files = await readdir(this.rejectedDir);

            for (const file of files) {
                if (file.endsWith('.pem')) {
                    const filepath = path.join(this.rejectedDir, file);
                    const content = await readFile(filepath);

                    rejectedCerts.push({
                        name: file,
                        path: filepath,
                        content: content.toString('base64')
                    });
                }
            }

            return rejectedCerts;
        } catch (error) {
            logger.error('Failed to get rejected certificates:', error);
            throw error;
        }
    }

    /**
     * Move a certificate from rejected to trusted
     * @param {string} filename - Name of the certificate file
     * @returns {Promise<string>} - Path to the trusted certificate
     */
    async acceptRejectedCertificate(filename) {
        try {
            const rejectedPath = path.join(this.rejectedDir, filename);
            const trustedPath = path.join(this.trustedDir, filename);

            // Check if the file exists
            if (!await exists(rejectedPath)) {
                throw new Error(`Rejected certificate not found: ${filename}`);
            }

            // Read the certificate
            const certificate = await readFile(rejectedPath);

            // Write to trusted directory
            await writeFile(trustedPath, certificate);

            // Delete from rejected directory
            await unlink(rejectedPath);

            logger.info(`Moved certificate from rejected to trusted: ${filename}`);

            return trustedPath;
        } catch (error) {
            logger.error('Failed to accept rejected certificate:', error);
            throw error;
        }
    }

    /**
     * Get OPCUA client options for certificate-based security
     * @param {string} securityMode - The security mode to use (None, Sign, SignAndEncrypt)
     * @param {string} securityPolicy - The security policy to use (None, Basic128Rsa15, etc.)
     * @returns {Promise<Object>} - Client options for node-opcua
     */
    async getClientOptions(securityMode = 'None', securityPolicy = 'None') {
        try {
            // Get hostname for consistent applicationUri
            const hostname = os.hostname();

            // Ensure application URI is set
            if (!this.applicationUri) {
                this.applicationUri = `urn:${hostname}:NodeOPCUA-Client`;
            }

            logger.info(`Using applicationUri in client options: ${this.applicationUri}`);

            // Check if security is None
            if (securityMode === 'None' && securityPolicy === 'None') {
                return {
                    applicationName: "NodeOPCUA-Client",
                    applicationUri: this.applicationUri,
                    connectionStrategy: {
                        initialDelay: 1000,
                        maxRetry: 3,
                        maxDelay: 10 * 1000
                    },
                    securityMode: require('node-opcua').MessageSecurityMode.None,
                    securityPolicy: require('node-opcua').SecurityPolicy.None,
                    endpointMustExist: false
                };
            }

            // Ensure certificate and private key exist
            if (!await exists(this.certificateFile) || !await exists(this.privateKeyFile)) {
                await this.createClientCertificate();
            }

            // Map security mode string to enum
            const messageSecurityMode = require('node-opcua').MessageSecurityMode[securityMode];
            if (!messageSecurityMode) {
                throw new Error(`Invalid security mode: ${securityMode}`);
            }

            // Map security policy string to enum
            const securityPolicyObj = require('node-opcua').SecurityPolicy[securityPolicy];
            if (!securityPolicyObj) {
                throw new Error(`Invalid security policy: ${securityPolicy}`);
            }

            // Return client options with the appropriate paths
            return {
                applicationName: "NodeOPCUA-Client",
                applicationUri: this.applicationUri,
                connectionStrategy: {
                    initialDelay: 1000,
                    maxRetry: 3,
                    maxDelay: 10 * 1000
                },
                securityMode: messageSecurityMode,
                securityPolicy: securityPolicyObj,
                certificateFile: this.certificateFile,
                privateKeyFile: this.privateKeyFile,
                serverCertificateManager: {
                    trustListPath: this.trustedDir,
                    rejectedListPath: this.rejectedDir
                },
                endpointMustExist: false,
                autoAcceptUntrustedCertificate: process.env.AUTO_ACCEPT_CERTIFICATES === 'true'
            };
        } catch (error) {
            logger.error('Failed to get client options:', error);
            throw error;
        }
    }

    /**
     * Get available security policies
     * @returns {Array<string>} - List of available security policies
     */
    getAvailableSecurityPolicies() {
        return Object.keys(SecurityPolicy)
            .filter(policy => typeof SecurityPolicy[policy] === 'string');
    }

    /**
     * Get available security modes
     * @returns {Array<string>} - List of available security modes
     */
    getAvailableSecurityModes() {
        return ['None', 'Sign', 'SignAndEncrypt'];
    }
}

module.exports = new CertificateManager();