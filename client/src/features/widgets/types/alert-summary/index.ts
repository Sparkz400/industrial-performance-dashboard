import AlertSummaryWidget from './AlertSummaryWidget';
import AlertSummaryWidgetView from './AlertSummaryWidgetView';

export { AlertSummaryWidget, AlertSummaryWidgetView };

export const widgetMeta = {
  type: 'alert-summary',
  name: 'Alert Summary',
  description: 'Shows active alert counts by severity and recent alerts',
  component: AlertSummaryWidget,
  settings: null,
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 2, h: 2 },
};

export default AlertSummaryWidget;
