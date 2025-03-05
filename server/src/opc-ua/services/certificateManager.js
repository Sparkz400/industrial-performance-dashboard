const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { OPCUACertificateManager } = require('node-opcua-certificate-manager');
const { SecurityPolicy } = require('node-opcua');
const logger = require('../../utils/logger');

// Promisify fs functions
const mkdir = promisify(fs.mkdir);
const exists = promisify(fs.exists);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

/**
 * Certificate Manager class to handle OPC UA certificate operations
 */
class CertificateManager {
    constructor() {
        // Configure certificate paths
        this.pkiDir = process.env.OPCUA_PKI_DIR || path.join(process.cwd(), 'certificates');
        this.certificatesDir = path.join(this.pkiDir, 'own');
        this.trustedDir = path.join(this.pkiDir, 'trusted');
        this.rejectedDir = path.join(this.pkiDir, 'rejected');
        this.issuerDir = path.join(this.pkiDir, 'issuer');

        // Certificate details
        this.applicationName = process.env.OPCUA_APPLICATION_NAME || 'Monitoring Dashboard Client';
        this.applicationUri = process.env.OPCUA_APPLICATION_URI || 'urn:monitoring-dashboard-client';
        this.certificateFile = path.join(this.certificatesDir, 'client_certificate.pem');
        this.privateKeyFile = path.join(this.certificatesDir, 'client_private_key.pem');

        // Certificate manager instance
        this.certManager = null;
    }

    /**
     * Initialize the certificate manager, creating necessary directories
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            // Create necessary directories
            await this.ensureDirectoryExists(this.pkiDir);
            await this.ensureDirectoryExists(this.certificatesDir);
            await this.ensureDirectoryExists(this.trustedDir);
            await this.ensureDirectoryExists(this.rejectedDir);
            await this.ensureDirectoryExists(this.issuerDir);

            // Initialize certificate manager
            this.certManager = new OPCUACertificateManager({
                rootFolder: this.pkiDir
            });

            // Create client certificate if it doesn't exist
            if (!await exists(this.certificateFile) || !await exists(this.privateKeyFile)) {
                await this.createClientCertificate();
            }

            logger.info(`Certificate Manager initialized: ${this.pkiDir}`);
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
            logger.info('Creating new client certificate');

            // Create certificate options
            const options = {
                applicationUri: this.applicationUri,
                dns: [
                    'localhost',
                    process.env.HOSTNAME || 'monitoring-dashboard'
                ],
                ip: [
                    '127.0.0.1'
                ],
                subject: this.applicationName,
                startDate: new Date(),
                validity: 365 * 5 // 5 years
            };

            // Create certificate using node-opcua
            const { cert, privateKey } = await this.certManager.createSelfSignedCertificate('client_certificate', options);

            // Save certificate and private key
            await writeFile(this.certificateFile, cert);
            await writeFile(this.privateKeyFile, privateKey);

            logger.info(`Client certificate created at: ${this.certificateFile}`);
        } catch (error) {
            logger.error('Failed to create client certificate:', error);
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
            const filename = `${name.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.pem`;
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
            const files = await promisify(fs.readdir)(this.trustedDir);

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
            const files = await promisify(fs.readdir)(this.rejectedDir);

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
            await promisify(fs.unlink)(rejectedPath);

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
            // Check if security is None
            if (securityMode === 'None' && securityPolicy === 'None') {
                return {
                    applicationName: this.applicationName,
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

            // Load certificates
            const { certificate, privateKey } = await this.loadCertificates();

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

            // Return client options
            return {
                applicationName: this.applicationName,
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
            .filter(policy => typeof SecurityPolicy[policy] === 'function');
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