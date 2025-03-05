const dbClient = require('../../database/dbConnection');
const logger = require('../../utils/logger');

/**
 * Service for managing certificate logs in the database
 */
class CertificateLogsService {
    /**
     * Log a certificate event
     * @param {Object} eventData - Certificate event data
     * @param {string} eventData.eventType - Type of event (e.g., RECEIVED, VALIDATED, TRUSTED)
     * @param {string} eventData.certificateName - Name of the certificate file
     * @param {string} eventData.certificateHash - SHA-256 hash of the certificate
     * @param {string} eventData.serverUri - URI of the server (for server certificates)
     * @param {string} eventData.action - Action taken (e.g., VALIDATE, TRUST, REJECT)
     * @param {string} eventData.status - Status of the action (e.g., SUCCESS, FAILED)
     * @param {string} eventData.details - Additional details or error message
     * @returns {Promise<Object>} Result of the logging operation
     */
    async logCertificateEvent(eventData) {
        try {
            const {
                eventType,
                certificateName,
                certificateHash,
                serverUri,
                action,
                status,
                details
            } = eventData;

            // Call the database function to log the event
            const result = await dbClient.query(
                `SELECT log_certificate_event($1, $2, $3, $4, $5, $6, $7)`,
                [
                    eventType,
                    certificateName,
                    certificateHash,
                    serverUri,
                    action,
                    status,
                    details
                ]
            );

            return { success: true };
        } catch (error) {
            logger.error('Error logging certificate event:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get certificate logs with pagination and filtering
     * @param {Object} options - Query options
     * @param {number} options.limit - Maximum number of logs to return
     * @param {number} options.offset - Offset for pagination
     * @param {string} options.eventType - Filter by event type
     * @param {string} options.startDate - Filter by start date
     * @param {string} options.endDate - Filter by end date
     * @returns {Promise<Object>} Certificate logs and count
     */
    async getCertificateLogs(options = {}) {
        const {
            limit = 100,
            offset = 0,
            eventType,
            startDate,
            endDate
        } = options;

        try {
            // Build the WHERE clause based on filters
            let whereClause = '';
            const queryParams = [];

            if (eventType) {
                queryParams.push(eventType);
                whereClause += `event_type = $${queryParams.length}`;
            }

            if (startDate) {
                if (whereClause) whereClause += ' AND ';
                queryParams.push(new Date(startDate));
                whereClause += `timestamp >= $${queryParams.length}`;
            }

            if (endDate) {
                if (whereClause) whereClause += ' AND ';
                queryParams.push(new Date(endDate));
                whereClause += `timestamp <= $${queryParams.length}`;
            }

            // Add WHERE clause to the query if filters are provided
            const whereStatement = whereClause ? `WHERE ${whereClause}` : '';

            // Add pagination parameters
            queryParams.push(limit);
            queryParams.push(offset);

            // Execute the query
            const query = `
                SELECT *
                FROM certificate_logs
                ${whereStatement}
                ORDER BY timestamp DESC
                LIMIT $${queryParams.length - 1}
                OFFSET $${queryParams.length}
            `;

            const countQuery = `
                SELECT COUNT(*)
                FROM certificate_logs
                ${whereStatement}
            `;

            // Execute queries in parallel
            const [logsResult, countResult] = await Promise.all([
                dbClient.query(query, queryParams),
                dbClient.query(countQuery, queryParams.slice(0, -2)) // Remove limit and offset
            ]);

            return {
                logs: logsResult.rows,
                total: parseInt(countResult.rows[0].count),
                limit,
                offset
            };
        } catch (error) {
            logger.error('Error fetching certificate logs:', error);
            throw error;
        }
    }

    /**
     * Get statistics about certificate events
     * @returns {Promise<Object>} Certificate statistics
     */
    async getCertificateStats() {
        try {
            const query = `
                SELECT
                    (SELECT COUNT(*) FROM certificate_logs) AS total_events,
                    (SELECT COUNT(*) FROM certificate_logs WHERE event_type = 'SERVER_CERTIFICATE_RECEIVED') AS received_count,
                    (SELECT COUNT(*) FROM certificate_logs WHERE action = 'TRUST') AS trusted_count,
                    (SELECT COUNT(*) FROM certificate_logs WHERE action = 'REJECT') AS rejected_count,
                    (SELECT COUNT(*) FROM certificate_logs WHERE status = 'FAILED') AS failed_count,
                    (SELECT COUNT(*) FROM certificate_logs WHERE timestamp > NOW() - INTERVAL '24 hours') AS last_24h_count
            `;

            const result = await dbClient.query(query);

            return result.rows[0] || {
                total_events: 0,
                received_count: 0,
                trusted_count: 0,
                rejected_count: 0,
                failed_count: 0,
                last_24h_count: 0
            };
        } catch (error) {
            logger.error('Error fetching certificate statistics:', error);
            throw error;
        }
    }
}

// Create singleton instance
const certificateLogsService = new CertificateLogsService();

module.exports = certificateLogsService;