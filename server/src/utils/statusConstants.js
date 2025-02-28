/**
 * Standardized status constants to ensure consistency across the application
 */
const StatusConstants = {
    // Connection states
    CONNECTED: 'CONNECTED',
    CONNECTING: 'CONNECTING',
    DISCONNECTED: 'DISCONNECTED',
    ERROR: 'ERROR',
    WARNING: 'WARNING',
    UNKNOWN: 'UNKNOWN',

    // Service names
    DATABASE: 'DATABASE',
    OPCUA: 'OPCUA',

    // Human-readable labels
    getStatusLabel: (status) => {
        switch(status) {
            case StatusConstants.CONNECTED: return 'Connected';
            case StatusConstants.CONNECTING: return 'Connecting...';
            case StatusConstants.DISCONNECTED: return 'Disconnected';
            case StatusConstants.ERROR: return 'Error';
            case StatusConstants.WARNING: return 'Warning';
            case StatusConstants.UNKNOWN:
            default:
                return 'Unknown';
        }
    },

    // Color mappings for UI
    getStatusColor: (status) => {
        switch(status) {
            case StatusConstants.CONNECTED: return 'success';
            case StatusConstants.CONNECTING: return 'info';
            case StatusConstants.WARNING: return 'warning';
            case StatusConstants.ERROR: return 'error';
            case StatusConstants.DISCONNECTED: return 'error';
            case StatusConstants.UNKNOWN:
            default:
                return 'default';
        }
    }
};

module.exports = StatusConstants;