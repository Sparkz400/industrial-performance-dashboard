const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const logger = require('../../utils/logger');
const certificateManager = require('../services/certificateManager');
const opcuaConnectionManager = require('../services/opcuaConnectionManager');

// Middleware to ensure certificates are initialized
const ensureCertificatesInitialized = async (req, res, next) => {
    try {
        await certificateManager.initialize();
        next();
    } catch (error) {
        logger.error('Error initializing certificates:', error);
        res.status(500).json({
            error: 'Failed to initialize certificates',
            message: error.message
        });
    }
};

// Apply the middleware to all routes in this router
router.use(ensureCertificatesInitialized);

/**
 * GET /api/certificates/trusted
 * Get a list of all trusted certificates
 */
router.get('/trusted', async (req, res) => {
    try {
        const trustedCerts = await certificateManager.getTrustedCertificates();
        res.json(trustedCerts);
    } catch (error) {
        logger.error('Error getting trusted certificates:', error);
        res.status(500).json({
            error: 'Failed to get trusted certificates',
            message: error.message
        });
    }
});

/**
 * GET /api/certificates/rejected
 * Get a list of all rejected certificates
 */
router.get('/rejected', async (req, res) => {
    try {
        const rejectedCerts = await certificateManager.getRejectedCertificates();
        res.json(rejectedCerts);
    } catch (error) {
        logger.error('Error getting rejected certificates:', error);
        res.status(500).json({
            error: 'Failed to get rejected certificates',
            message: error.message
        });
    }
});

/**
 * POST /api/certificates/trust
 * Trust a server certificate
 * Body: { certificate: base64_encoded_cert, name: certificate_name }
 */
router.post('/trust', async (req, res) => {
    try {
        const { certificate, name } = req.body;

        if (!certificate || !name) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'Certificate and name are required'
            });
        }

        // Decode the base64 certificate
        const certBuffer = Buffer.from(certificate, 'base64');

        // Trust the certificate
        const filepath = await certificateManager.trustCertificate(certBuffer, name);

        res.json({
            message: 'Certificate trusted successfully',
            filepath
        });
    } catch (error) {
        logger.error('Error trusting certificate:', error);
        res.status(500).json({
            error: 'Failed to trust certificate',
            message: error.message
        });
    }
});

/**
 * POST /api/certificates/accept-rejected/:filename
 * Accept a rejected certificate
 */
router.post('/accept-rejected/:filename', async (req, res) => {
    try {
        const { filename } = req.params;

        if (!filename) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'Filename is required'
            });
        }

        // Accept the rejected certificate
        const filepath = await certificateManager.acceptRejectedCertificate(filename);

        res.json({
            message: 'Rejected certificate accepted successfully',
            filepath
        });
    } catch (error) {
        logger.error('Error accepting rejected certificate:', error);
        res.status(500).json({
            error: 'Failed to accept rejected certificate',
            message: error.message
        });
    }
});

/**
 * POST /api/certificates/regenerate
 * Regenerate the client certificate
 */
router.post('/regenerate', async (req, res) => {
    try {
        // Create a new client certificate
        await certificateManager.createClientCertificate();

        res.json({
            message: 'Client certificate regenerated successfully'
        });
    } catch (error) {
        logger.error('Error regenerating client certificate:', error);
        res.status(500).json({
            error: 'Failed to regenerate client certificate',
            message: error.message
        });
    }
});

/**
 * GET /api/certificates/client
 * Get the client certificate details
 */
router.get('/client', async (req, res) => {
    try {
        const certificateFile = path.join(certificateManager.certificatesDir, 'client_certificate.pem');
        const privateKeyFile = path.join(certificateManager.certificatesDir, 'client_private_key.pem');

        // Check if the files exist
        const [certExists, keyExists] = await Promise.all([
            promisify(fs.exists)(certificateFile),
            promisify(fs.exists)(privateKeyFile)
        ]);

        if (!certExists || !keyExists) {
            return res.status(404).json({
                error: 'Client certificate not found',
                message: 'Please generate a client certificate first'
            });
        }

        // Read the certificate (but not the private key)
        const certificate = await promisify(fs.readFile)(certificateFile, 'utf8');

        res.json({
            certificate,
            certificatePath: certificateFile,
            privateKeyPath: privateKeyFile,
            hasPrivateKey: keyExists
        });
    } catch (error) {
        logger.error('Error getting client certificate:', error);
        res.status(500).json({
            error: 'Failed to get client certificate',
            message: error.message
        });
    }
});

/**
 * GET /api/certificates/security-options
 * Get available security modes and policies
 */
router.get('/security-options', (req, res) => {
    try {
        const securityOptions = opcuaConnectionManager.getSecurityOptions();

        // Add the current configuration
        const connectionInfo = opcuaConnectionManager.getConnectionInfo();

        res.json({
            ...securityOptions,
            current: {
                securityMode: connectionInfo.securityMode || connectionInfo.config.securityMode,
                securityPolicy: connectionInfo.securityPolicy || connectionInfo.config.securityPolicy
            }
        });
    } catch (error) {
        logger.error('Error getting security options:', error);
        res.status(500).json({
            error: 'Failed to get security options',
            message: error.message
        });
    }
});

module.exports = router;