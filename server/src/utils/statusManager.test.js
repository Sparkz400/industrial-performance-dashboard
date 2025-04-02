// ===== ..\server\src\utils\statusManager.test.js =====
const statusManager = require('./status'); // Assuming singleton instance is exported
const StatusConstants = require('./statusConstants');

// Reset status manager before each test if needed (depends if it's a true singleton)
// beforeEach(() => {
//   // If statusManager had a reset method, call it here
// });

describe('StatusManager', () => {
    it('should initialize with UNKNOWN status', () => {
        const initialStatus = statusManager.getFullStatus();
        expect(initialStatus.status[StatusConstants.DATABASE]).toBe(StatusConstants.UNKNOWN);
        expect(initialStatus.status[StatusConstants.OPCUA]).toBe(StatusConstants.UNKNOWN);
        expect(initialStatus.overall).toBe(StatusConstants.UNKNOWN);
        expect(initialStatus.details[StatusConstants.DATABASE].message).toBe('Not initialized');
    });

    it('should set service status and details correctly', () => {
        const details = { message: 'DB Connected', poolSize: 10 };
        statusManager.setDatabaseStatus(StatusConstants.CONNECTED, details);

        const currentStatus = statusManager.getFullStatus();
        expect(currentStatus.status[StatusConstants.DATABASE]).toBe(StatusConstants.CONNECTED);
        expect(currentStatus.details[StatusConstants.DATABASE]).toEqual(details);
        expect(currentStatus.lastUpdated).toBeDefined();
    });

    it('should emit statusChanged event when status changes', () => {
        const listener = jest.fn();
        statusManager.on('statusChanged', listener);

        statusManager.setOpcuaStatus(StatusConstants.CONNECTING, { attempt: 1 });

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(expect.objectContaining({
            service: StatusConstants.OPCUA,
            oldStatus: StatusConstants.UNKNOWN, // Assuming initial state
            newStatus: StatusConstants.CONNECTING,
            details: { attempt: 1 }
        }));

        // Setting same status should not emit again
        statusManager.setOpcuaStatus(StatusConstants.CONNECTING, { attempt: 2 });
        expect(listener).toHaveBeenCalledTimes(1); // Still 1

        statusManager.off('statusChanged', listener); // Clean up listener
    });

    it('should calculate overall status correctly (worst status wins)', () => {
        statusManager.setDatabaseStatus(StatusConstants.CONNECTED);
        statusManager.setOpcuaStatus(StatusConstants.CONNECTED);
        expect(statusManager.getOverallStatus()).toBe(StatusConstants.CONNECTED);

        statusManager.setOpcuaStatus(StatusConstants.WARNING);
        expect(statusManager.getOverallStatus()).toBe(StatusConstants.WARNING);

        statusManager.setDatabaseStatus(StatusConstants.ERROR);
        expect(statusManager.getOverallStatus()).toBe(StatusConstants.ERROR);

        statusManager.setOpcuaStatus(StatusConstants.DISCONNECTED);
        expect(statusManager.getOverallStatus()).toBe(StatusConstants.ERROR); // Error is worse than Disconnected

        statusManager.setDatabaseStatus(StatusConstants.DISCONNECTED);
        expect(statusManager.getOverallStatus()).toBe(StatusConstants.DISCONNECTED);
    });

    // Add more tests for getServiceStatus, getServiceDetails, getStatus etc.
});