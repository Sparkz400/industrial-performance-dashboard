import React from 'react';

export const widgetRegistry = {
    currentAirConsumptionWidget: {
        component: React.lazy(() => import('../CurrentAirConsumptionWidget.jsx')),
        minW: 4,
        minH: 9,
    },
    operationMode: {
        component: React.lazy(() => import('../OperationModeWidget.jsx')),
        minW: 4,
        minH: 6,
    },
    operationModePie: {
        component: React.lazy(() => import('../OperationModeWidgetPie.jsx')),
        minW: 4,
        minH: 10,
    },
    upTimeRate: {
        component: React.lazy(() => import('../Uptime/UptimeRatePerDayWidget.jsx')),
        settingsComponent: React.lazy(() =>
            import('../Uptime/UptimeRatePerDaySettings.jsx')
        ),
        minW: 4,
        minH: 10,
    },
};

export default widgetRegistry;
