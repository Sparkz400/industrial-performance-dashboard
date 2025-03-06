// Re-export components from widgets feature
import WidgetContainer from './components/WidgetContainer';
import WidgetGrid from './components/WidgetGrid';
import WidgetPreviewPopup from './components/WidgetPreviewPopup';
import { WidgetProvider, useWidgets } from './contexts/WidgetContext';
import { widgetRegistry } from './registry/WidgetRegistry';

// Import widget types
import * as AlarmDashboard from './types/alarm-dashboard';
import * as OperationMode from './types/operation-mode';
import CurrentAirConsumptionWidget from './types/CurrentAirConsumptionWidget';
import OperationModeWidgetPie from './types/OperationModeWidgetPie';
import SystemStatusWidget from './types/system/SystemStatusWidget';
import SystemStatusSettings from './types/system/SystemStatusSettings';
import UptimeRatePerDayWidget from './types/UptimeRatePerDayWidget';
import UptimeRatePerDaySettings from './types/UptimeRatePerDaySettings';

// Export widget components
export {
    // Core widget components
    WidgetContainer,
    WidgetGrid,
    WidgetPreviewPopup,
    WidgetProvider,
    useWidgets,
    widgetRegistry,

    // Widget types
    AlarmDashboard,
    OperationMode,
    CurrentAirConsumptionWidget,
    OperationModeWidgetPie,
    SystemStatusWidget,
    SystemStatusSettings,
    UptimeRatePerDayWidget,
    UptimeRatePerDaySettings
};

// Export a convenience object with all available widgets
export const WidgetTypes = {
    AlarmDashboard: AlarmDashboard.AlarmDashboardWidget,
    OperationMode: OperationMode.OperationModeWidget,
    CurrentAirConsumption: CurrentAirConsumptionWidget,
    OperationModePie: OperationModeWidgetPie,
    SystemStatus: SystemStatusWidget,
    UptimeRatePerDay: UptimeRatePerDayWidget
};

// Export default provider
export default WidgetProvider;