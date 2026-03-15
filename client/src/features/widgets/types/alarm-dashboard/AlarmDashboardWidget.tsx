import React from 'react';
import { useAlarmData } from './useAlarmData';
import AlarmDashboardWidgetView from './AlarmDashboardWidgetView';

// Simple container with minimal props
/**
 *
 */
function AlarmDashboardWidget(): React.ReactElement {
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
