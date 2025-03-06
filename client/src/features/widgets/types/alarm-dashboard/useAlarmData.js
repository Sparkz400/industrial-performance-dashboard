import { useState, useEffect } from 'react';

// Constants
export const SEVERITY_LEVELS = {
    CRITICAL: 'critical',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
    INFO: 'info'
};

export const ALARM_STATUS = {
    ACTIVE: 'active',
    ACKNOWLEDGED: 'acknowledged',
    CLEARED: 'cleared'
};

// Simplified hook with minimal dependencies
export function useAlarmData() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Generate mock data only once on mount
    useEffect(() => {
        setLoading(true);

        try {
            // Generate mock data
            const mockData = generateMockAlarms();
            setData(mockData);
            setError(null);
        } catch (err) {
            setError("Error generating alarm data");
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    // No dependency on any state for this function
    function acknowledgeAlarm(id) {
        setData(prev => prev.map(alarm => {
            if (alarm.id === id && alarm.status === ALARM_STATUS.ACTIVE) {
                return {
                    ...alarm,
                    status: ALARM_STATUS.ACKNOWLEDGED,
                    acknowledgedTime: new Date().toISOString()
                };
            }
            return alarm;
        }));
    }

    // No dependency on any state for this function
    function clearAlarm(id) {
        setData(prev => prev.map(alarm => {
            if (alarm.id === id && alarm.status !== ALARM_STATUS.CLEARED) {
                return {
                    ...alarm,
                    status: ALARM_STATUS.CLEARED,
                    clearedTime: new Date().toISOString()
                };
            }
            return alarm;
        }));
    }

    return {
        data,
        loading,
        error,
        acknowledgeAlarm,
        clearAlarm
    };
}

// Standalone function with no dependencies
function generateMockAlarms() {
    const alarmTypes = [
        'High Temperature', 'Low Pressure', 'Motor Overload',
        'Communication Error', 'Sensor Fault', 'Valve Failure'
    ];

    const sources = [
        'System', 'PLC1', 'PLC2', 'Conveyor', 'Robot', 'Temperature Sensor'
    ];

    const severities = [
        SEVERITY_LEVELS.CRITICAL, SEVERITY_LEVELS.HIGH,
        SEVERITY_LEVELS.MEDIUM, SEVERITY_LEVELS.LOW, SEVERITY_LEVELS.INFO
    ];

    const statuses = [
        ALARM_STATUS.ACTIVE, ALARM_STATUS.ACKNOWLEDGED, ALARM_STATUS.CLEARED
    ];

    const mockAlarms = [];
    const now = new Date();

    for (let i = 0; i < 50; i++) {
        const severity = severities[Math.floor(Math.random() * severities.length)];
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        const alarmType = alarmTypes[Math.floor(Math.random() * alarmTypes.length)];
        const source = sources[Math.floor(Math.random() * sources.length)];

        const time = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000);

        mockAlarms.push({
            id: `alarm-${i}`,
            time: time.toISOString(),
            message: `${alarmType} detected on ${source}`,
            severity,
            status,
            source
        });
    }

    return mockAlarms;
}

export default useAlarmData;