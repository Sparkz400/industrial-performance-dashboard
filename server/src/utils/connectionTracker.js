/**
 * Simple module to track active connections across the application
 */
class ConnectionTracker {
    constructor() {
        this.activeConnections = 0;
        this.connectionHistory = [];
        this.maxHistoryLength = 100;
        this.connectedClients = new Map(); // socketId -> connection info
    }

    /**
     * Register a new connection
     * @param {string} socketId - The socket ID
     * @param {Object} info - Optional connection info object
     */
    addConnection(socketId, info = {}) {
        this.activeConnections++;

        const connectionInfo = {
            id: socketId,
            connectedAt: new Date(),
            ...info
        };

        this.connectedClients.set(socketId, connectionInfo);

        // Add to history
        this.connectionHistory.push({
            type: 'connect',
            timestamp: new Date(),
            id: socketId,
            info
        });

        // Trim history if needed
        if (this.connectionHistory.length > this.maxHistoryLength) {
            this.connectionHistory = this.connectionHistory.slice(-this.maxHistoryLength);
        }

        return this.activeConnections;
    }

    /**
     * Remove a connection
     * @param {string} socketId - The socket ID
     */
    removeConnection(socketId) {
        if (this.connectedClients.has(socketId)) {
            this.activeConnections = Math.max(0, this.activeConnections - 1);

            const clientInfo = this.connectedClients.get(socketId);
            this.connectedClients.delete(socketId);

            // Add to history
            this.connectionHistory.push({
                type: 'disconnect',
                timestamp: new Date(),
                id: socketId,
                duration: clientInfo ? (new Date() - clientInfo.connectedAt) : null
            });

            // Trim history if needed
            if (this.connectionHistory.length > this.maxHistoryLength) {
                this.connectionHistory = this.connectionHistory.slice(-this.maxHistoryLength);
            }
        }

        return this.activeConnections;
    }

    /**
     * Get the current number of active connections
     * @returns {number} Active connection count
     */
    getActiveConnectionCount() {
        return this.activeConnections;
    }

    /**
     * Get a list of currently connected clients
     * @returns {Array} Array of connected client info objects
     */
    getConnectedClients() {
        return Array.from(this.connectedClients.values());
    }

    /**
     * Get connection history
     * @param {number} limit - Optional limit of history items to return
     * @returns {Array} Array of connection history items
     */
    getConnectionHistory(limit = this.maxHistoryLength) {
        return this.connectionHistory.slice(-limit);
    }

    /**
     * Reset the tracker
     */
    reset() {
        this.activeConnections = 0;
        this.connectionHistory = [];
        this.connectedClients.clear();
    }
}

// Create singleton instance
const connectionTracker = new ConnectionTracker();

module.exports = connectionTracker;