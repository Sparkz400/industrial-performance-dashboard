// Re-export components and hooks from alarm-dashboard widget
import AlarmDashboardWidget from './AlarmDashboardWidget';
import AlarmDashboardWidgetSettings from './AlarmDashboardWidgetSettings';
import AlarmDashboardWidgetView from './AlarmDashboardWidgetView';
import useAlarmData from './useAlarmData';

// Export individual components and hooks
export {
  AlarmDashboardWidget,
  AlarmDashboardWidgetSettings,
  AlarmDashboardWidgetView,
  useAlarmData,
};

// Export widget metadata for registration
export const widgetMeta = {
  type: 'alarm-dashboard',
  name: 'Alarm Dashboard',
  description: 'Displays system alarms and notifications',
  component: AlarmDashboardWidget,
  settings: AlarmDashboardWidgetSettings,
  defaultSize: { w: 4, h: 3 },
  minSize: { w: 2, h: 2 },
};

// Export default component for easier imports
export default AlarmDashboardWidget;
