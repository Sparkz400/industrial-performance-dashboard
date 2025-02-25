import currentAirConsumptionWidget from '../CurrentAirConsumptionWidget.jsx';
import OperationModeWidget from '../OperationModeWidget.jsx';
import OperationModePieWidget from "../OperationModeWidgetPie.jsx";
import UptimeWidget from "../Uptime/UptimeRatePerDayWidget.jsx"
import UptimeRatePerDaySettings from "../Uptime/UptimeRatePerDaySettings.jsx";

export const widgetRegistry = {
    currentAirConsumptionWidget: {
        component: currentAirConsumptionWidget,
        minW: 4,
        minH: 9
    },
    operationMode: {
        component: OperationModeWidget,
        minW: 4,
        minH: 6
    },
    operationModePie: {
        component: OperationModePieWidget,
        minW: 4,
        minH: 10
    },
    upTimeRate: {
        component: UptimeWidget,
        settingsComponent: UptimeRatePerDaySettings,
        minW: 4,
        minH: 10
    },

};

export default widgetRegistry;