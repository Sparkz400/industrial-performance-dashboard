import React from 'react';

// Widget categories for better organization
export const WIDGET_CATEGORIES = {
    MONITORING: 'Monitoring',
    ANALYTICS: 'Analytics',
    SYSTEM: 'System',
    CONTROL: 'Control'
};

export const widgetRegistry = {
    alarmDashboard: {
        component: React.lazy(() => import('../types/alarm-dashboard/index.js')),
        settingsComponent: React.lazy(() => import('../types/alarm-dashboard/AlarmDashboardWidgetSettings.jsx')),
        minW: 6,
        minH: 6,
        title: 'Alarm Dashboard',
        description: 'Displays system alarms with filtering capabilities',
        category: WIDGET_CATEGORIES.MONITORING,
        icon: 'Notifications',
        defaultConfig: {
            rowsPerPage: 5
        },
    },
    systemStatus: {
        component: React.lazy(() => import('../types/system/SystemStatusWidget.jsx')),
        settingsComponent: React.lazy(() => import('../types/system/SystemStatusSettings.jsx')),
        minW: 4,
        minH: 6,
        title: 'System Status',
        description: 'Shows the current status of system components',
        category: WIDGET_CATEGORIES.SYSTEM,
        icon: 'Dashboard',
        defaultConfig: {
            autoRefresh: true,
            showDetails: true,
            refreshInterval: 20000
        },
    },
    currentAirConsumptionWidget: {
        component: React.lazy(() => import('../types/CurrentAirConsumptionWidget.jsx')),
        settingsComponent: null, // Add a placeholder for consistency
        minW: 4,
        minH: 9,
        title: 'Air Consumption',
        description: 'Shows current air consumption metrics',
        category: WIDGET_CATEGORIES.MONITORING,
        icon: 'TrendingUp', // Material UI icon name
        defaultConfig: {}, // Default configuration values
    },
    operationMode: {
        component: React.lazy(() => import('../types/operation-mode/index.js')),
        settingsComponent: React.lazy(() => import('../types/operation-mode/OperationModeWidgetSettings.jsx')),
        minW: 4,
        minH: 6,
        title: 'Operation Mode',
        description: 'Tracks system operation mode over time',
        category: WIDGET_CATEGORIES.ANALYTICS,
        icon: 'Timeline',
        defaultConfig: {
            maxPoints: 120,
            showBrush: true
        },
    },
    operationModePie: {
        component: React.lazy(() => import('../types/OperationModeWidgetPie.jsx')),
        settingsComponent: null,
        minW: 4,
        minH: 10,
        title: 'Operation Mode Pie',
        description: 'Shows operation mode distribution as a pie chart',
        category: WIDGET_CATEGORIES.ANALYTICS,
        icon: 'PieChart',
        defaultConfig: {},
    },
    upTimeRate: {
        component: React.lazy(() => import('../types/UptimeRatePerDayWidget.jsx')),
        settingsComponent: React.lazy(() =>
            import('../types/UptimeRatePerDaySettings.jsx')
        ),
        minW: 4,
        minH: 10,
        title: 'Uptime Rate',
        description: 'Shows system uptime rate per day',
        category: WIDGET_CATEGORIES.ANALYTICS,
        icon: 'AccessTime',
        defaultConfig: {
            expectedUptime: 99
        },
    },
};

// Helper function to get widgets by category
export const getWidgetsByCategory = () => {
    const categorized = {};

    Object.entries(widgetRegistry).forEach(([key, widget]) => {
        const category = widget.category || 'Uncategorized';

        if (!categorized[category]) {
            categorized[category] = [];
        }

        categorized[category].push({
            type: key,
            ...widget
        });
    });

    return categorized;
};

export default widgetRegistry;