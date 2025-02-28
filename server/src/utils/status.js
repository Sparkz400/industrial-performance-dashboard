const StatusConstants = require('./statusConstants');
const EventEmitter = require('events');

/**
 * Status manager with event emitter for real-time updates
 */
class StatusManager extends EventEmitter {
    constructor() {
        super();
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
        if (this._status[service] !== newStatus) {
            const oldStatus = this._status[service];
            this._status[service] = newStatus;
            this._status.lastUpdated = new Date().toISOString();
            this._details[service] = details;

            // Emit events for status change
            this.emit('statusChanged', {
                service,
                oldStatus,
                newStatus,
                timestamp: this._status.lastUpdated,
                details
            });
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
    getFullStatus() {
        return {
            status: { ...this._status },
            details: { ...this._details },
            overall: this.getOverallStatus(),
            overallLabel: StatusConstants.getStatusLabel(this.getOverallStatus()),
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

    /**
     * Simplified status object for lightweight responses
     * @returns {Object} - Simplified status info
     */
    getStatus() {
        return {
            database: this._status[StatusConstants.DATABASE],
            opcua: this._status[StatusConstants.OPCUA],
            overall: this.getOverallStatus(),
            lastUpdated: this._status.lastUpdated
        };
    }
}

// Create singleton instance
const statusManager = new StatusManager();

module.exports = statusManager;