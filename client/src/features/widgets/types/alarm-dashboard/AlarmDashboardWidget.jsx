import React from 'react';
import { useAlarmData } from './useAlarmData.js';
import AlarmDashboardWidgetView from './AlarmDashboardWidgetView.jsx';

// Simple container with minimal props
function AlarmDashboardWidget() {
    const { data, loading, error, acknowledgeAlarm, clearAlarm } = useAlarmData();

    return (
        <AlarmDashboardWidgetView
            alarms={data}
            loading={loading}
            error={error}
            onAcknowledge={acknowledgeAlarm}
            onClear={clearAlarm}
        />
    );
}

export default AlarmDashboardWidget;