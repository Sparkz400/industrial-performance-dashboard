import DummyWidget from './DummyWidget';
import currentAirConsumptionWidget from './CurrentAirConsumptionWidget';
import OperationModeWidget from './OperationModeWidget';
import OperationModePieWidget from "./OperationModeWidgetPie";
import UptimeWidget from "./Uptime/UptimeRatePerDayWidget.jsx"
import UptimeRatePerDaySettings from "./Uptime/UptimeRatePerDaySettings.jsx";

export const widgetRegistry = {
    dummy: {
        component: DummyWidget,
        minW: 2,
        minH: 2
    },
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