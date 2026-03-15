// Re-export components and hooks from operation-mode widget
import OperationModeWidget from './OperationModeWidget';
import OperationModeWidgetSettings from './OperationModeWidgetSettings';
import OperationModeWidgetView from './OperationModeWidgetView';

// Export individual components and hooks
export { OperationModeWidget, OperationModeWidgetSettings, OperationModeWidgetView };

// Export widget metadata for registration
export const widgetMeta = {
  type: 'operation-mode',
  name: 'Operation Mode',
  description: 'Displays the current system operation mode',
  component: OperationModeWidget,
  settings: OperationModeWidgetSettings,
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 2, h: 2 },
};

// Export default component for easier imports
export default OperationModeWidget;
