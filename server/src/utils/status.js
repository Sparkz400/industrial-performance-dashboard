const StatusConstants = require('./statusConstants');
const EventEmitter = require('events');

/**
 * Status manager with event emitter for real-time updates
 */
class StatusManager extends EventEmitter { // Inherit from EventEmitter
    constructor() {
        super(); // Call EventEmitter constructor
        this._status = {
            [StatusConstants.DATABASE]: StatusConstants.UNKNOWN,
            [StatusConstants.OPCUA]: StatusConstants.UNKNOWN,
            lastUpdated: new Date().toISOString()
        };
        this._details = {
            [StatusConstants.DATABASE]: { message: 'Not initialized' },
            [StatusConstants.OPCUA]: { message: 'Not initialized' }
        };
    }

    /**
     * Set the status for a specific service
     * @param {string} service - The service name (use StatusConstants)
     * @param {string} newStatus - The status value (use StatusConstants)
     * @param {Object} details - Optional details about the status
     */
    setServiceStatus(service, newStatus, details = {}) {
        // Only update and emit if the status or details actually changed
        const oldStatus = this._status[service];
        const oldDetailsString = JSON.stringify(this._details[service]);
        const newDetailsString = JSON.stringify(details);

        if (oldStatus !== newStatus || oldDetailsString !== newDetailsString) {
            const timestamp = new Date().toISOString();

            this._status = {
                ...this._status,
                [service]: newStatus,
                lastUpdated: timestamp
            };

            this._details = {
                ...this._details,
                [service]: details
            };

            const fullStatus = this.getFullStatus(); // Get the complete current status

            // Emit events for status change AFTER state is updated
            this.emit('statusChanged', { // Keep this for potential internal listeners
                service,
                oldStatus,
                newStatus,
                timestamp,
                details
            });
            // Emit a dedicated event for broadcasting the full status via WebSocket
            this.emit('broadcastUpdate', fullStatus);
        }
    }

    /**
     * Get overall system status
     * @returns {string} The overall status (worst status wins)
     */
    getOverallStatus() {
        const statusPriority = [
            StatusConstants.UNKNOWN,
            StatusConstants.CONNECTED,
            StatusConstants.CONNECTING,
            StatusConstants.WARNING,
            StatusConstants.DISCONNECTED,
            StatusConstants.ERROR
        ];

        // Get the worst status (highest priority)
        let worstStatus = StatusConstants.UNKNOWN;
        for (const service in this._status) {
            if (service !== 'lastUpdated') {
                const serviceStatus = this._status[service];
                const currentPriority = statusPriority.indexOf(worstStatus);
                const servicePriority = statusPriority.indexOf(serviceStatus);

                if (servicePriority > currentPriority) {
                    worstStatus = serviceStatus;
                }
            }
        }

        return worstStatus;
    }

    /**
     * Get service status
     * @param {string} service - The service name
     * @returns {string} The status value
     */
    getServiceStatus(service) {
        return this._status[service] || StatusConstants.UNKNOWN;
    }

    /**
     * Get service details
     * @param {string} service - The service name
     * @returns {Object} The status details
     */
    getServiceDetails(service) {
        return this._details[service] || {};
    }

    /**
     * Get complete status object for API response
     * @returns {Object} - Complete status information
     */
    /** Get complete status object */
    getFullStatus() {
        const overall = this.getOverallStatus();
        const dbStatus = this.getServiceStatus(StatusConstants.DATABASE);
        const opcuaStatus = this.getServiceStatus(StatusConstants.OPCUA);
        return {
            database: {
                status: dbStatus,
                statusText: StatusConstants.getStatusLabel(dbStatus),
                statusColor: StatusConstants.getStatusColor(dbStatus),
                details: this.getServiceDetails(StatusConstants.DATABASE) || {}
            },
            opcua: {
                status: opcuaStatus,
                statusText: StatusConstants.getStatusLabel(opcuaStatus),
                statusColor: StatusConstants.getStatusColor(opcuaStatus),
                details: this.getServiceDetails(StatusConstants.OPCUA) || {}
            },
            overall: { // <-- Standardize structure here
                status: overall,
                statusText: StatusConstants.getStatusLabel(overall),
                statusColor: StatusConstants.getStatusColor(overall)
            },
            lastUpdated: this._status.lastUpdated
        };
    }

    /**
     * Shorthand for setting database status
     * @param {string} newStatus - Status value
     * @param {Object} details - Optional details
     */
    setDatabaseStatus(newStatus, details = {}) {
        this.setServiceStatus(StatusConstants.DATABASE, newStatus, details);
    }

    /**
     * Shorthand for setting OPCUA status
     * @param {string} newStatus - Status value
     * @param {Object} details - Optional details
     */
    setOpcuaStatus(newStatus, details = {}) {
        this.setServiceStatus(StatusConstants.OPCUA, newStatus, details);
    }
}

// Create singleton instance
const statusManager = new StatusManager();

module.exports = statusManager;