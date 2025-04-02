// ===== ..\server\src\utils\statusConstants.test.js =====
const StatusConstants = require('./statusConstants');

describe('StatusConstants', () => {
    it('should define standard status constants', () => {
        expect(StatusConstants.CONNECTED).toBe('CONNECTED');
        expect(StatusConstants.ERROR).toBe('ERROR');
        // ... add more checks for other constants
    });

    describe('getStatusLabel', () => {
        it('should return correct labels for known statuses', () => {
            expect(StatusConstants.getStatusLabel(StatusConstants.CONNECTED)).toBe('Connected');
            expect(StatusConstants.getStatusLabel(StatusConstants.ERROR)).toBe('Error');
            expect(StatusConstants.getStatusLabel(StatusConstants.WARNING)).toBe('Warning');
            // ... test other labels
        });

        it('should return "Unknown" for undefined or unknown statuses', () => {
            expect(StatusConstants.getStatusLabel('SOME_UNKNOWN_STATUS')).toBe('Unknown');
            expect(StatusConstants.getStatusLabel(undefined)).toBe('Unknown');
            expect(StatusConstants.getStatusLabel(null)).toBe('Unknown');
        });
    });

    describe('getStatusColor', () => {
        it('should return correct colors for known statuses', () => {
            expect(StatusConstants.getStatusColor(StatusConstants.CONNECTED)).toBe('success');
            expect(StatusConstants.getStatusColor(StatusConstants.ERROR)).toBe('error');
            expect(StatusConstants.getStatusColor(StatusConstants.WARNING)).toBe('warning');
            // ... test other colors
        });

        it('should return "default" for undefined or unknown statuses', () => {
            expect(StatusConstants.getStatusColor('SOME_UNKNOWN_STATUS')).toBe('default');
            expect(StatusConstants.getStatusColor(undefined)).toBe('default');
        });
    });
});