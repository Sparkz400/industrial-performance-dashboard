import React from 'react';
import type { WidgetMeta, WidgetRegistry as WidgetRegistryType } from '@/types';

// Widget categories for better organization
export const WIDGET_CATEGORIES: Record<string, string> = {
  MONITORING: 'Monitoring',
  ANALYTICS: 'Analytics',
  SYSTEM: 'System',
  CONTROL: 'Control',
  PRODUCTION: 'Production',
};

// Category color palette for visual distinction
export interface CategoryColor {
  main: string;
  light: string;
  dark: string;
}

export const CATEGORY_COLORS: Record<string, CategoryColor> = {
  [WIDGET_CATEGORIES.MONITORING]: { main: '#ef5350', light: '#ffebee', dark: '#c62828' },
  [WIDGET_CATEGORIES.ANALYTICS]: { main: '#527783', light: '#E2EBEE', dark: '#304D58' },
  [WIDGET_CATEGORIES.SYSTEM]: { main: '#26a69a', light: '#e0f2f1', dark: '#00695c' },
  [WIDGET_CATEGORIES.CONTROL]: { main: '#ffa726', light: '#fff3e0', dark: '#e65100' },
  [WIDGET_CATEGORIES.PRODUCTION]: { main: '#42a5f5', light: '#e3f2fd', dark: '#1565c0' },
};

// Absolute minimum grid units any widget can be resized to
const MIN_W = 2;
const MIN_H = 2;

export const widgetRegistry: WidgetRegistryType = {
  alarmDashboard: {
    component: React.lazy(() => import('../types/alarm-dashboard/index')),
    settingsComponent: React.lazy(
      () => import('../types/alarm-dashboard/AlarmDashboardWidgetSettings'),
    ),
    minW: MIN_W,
    minH: MIN_H,
    defaultW: 6,
    defaultH: 6,
    title: 'Alarm Dashboard',
    description: 'Displays system alarms with filtering capabilities',
    category: WIDGET_CATEGORIES.MONITORING,
    icon: 'Notifications',
    defaultConfig: {
      rowsPerPage: 5,
    },
  },
  systemStatus: {
    component: React.lazy(() => import('../types/system/SystemStatusWidget')),
    settingsComponent: React.lazy(() => import('../types/system/SystemStatusSettings')),
    minW: MIN_W,
    minH: MIN_H,
    defaultW: 4,
    defaultH: 6,
    title: 'System Status',
    description: 'Shows the current status of system components',
    category: WIDGET_CATEGORIES.SYSTEM,
    icon: 'Dashboard',
    defaultConfig: {
      autoRefresh: true,
      showDetails: true,
      refreshInterval: 20000,
    },
  },
  currentAirConsumptionWidget: {
    component: React.lazy(() => import('../types/CurrentAirConsumptionWidget')),
    settingsComponent: React.lazy(() => import('../types/EvidenceWidgetSettings')),
    minW: MIN_W,
    minH: MIN_H,
    defaultW: 4,
    defaultH: 9,
    title: 'Air Consumption',
    description: 'Shows current air consumption metrics',
    category: WIDGET_CATEGORIES.MONITORING,
    icon: 'TrendingUp',
    defaultConfig: {},
  },
  operationMode: {
    component: React.lazy(() => import('../types/operation-mode/index')),
    settingsComponent: React.lazy(
      () => import('../types/operation-mode/OperationModeWidgetSettings'),
    ),
    minW: MIN_W,
    minH: MIN_H,
    defaultW: 4,
    defaultH: 6,
    title: 'Operation Mode',
    description: 'Tracks system operation mode over time',
    category: WIDGET_CATEGORIES.ANALYTICS,
    icon: 'Timeline',
    defaultConfig: {
      maxPoints: 120,
      showBrush: true,
    },
  },
  operationModePie: {
    component: React.lazy(() => import('../types/OperationModeWidgetPie')),
    settingsComponent: React.lazy(() => import('../types/EvidenceWidgetSettings')),
    minW: MIN_W,
    minH: MIN_H,
    defaultW: 4,
    defaultH: 10,
    title: 'Observed State Distribution',
    description: 'Shows measured state durations with explicit unknown coverage',
    category: WIDGET_CATEGORIES.ANALYTICS,
    icon: 'PieChart',
    defaultConfig: {},
  },
  upTimeRate: {
    component: React.lazy(() => import('../types/UptimeRatePerDayWidget')),
    settingsComponent: React.lazy(() => import('../types/UptimeRatePerDaySettings')),
    minW: MIN_W,
    minH: MIN_H,
    defaultW: 4,
    defaultH: 10,
    title: 'Uptime Rate',
    description: 'Shows system uptime rate per day',
    category: WIDGET_CATEGORIES.ANALYTICS,
    icon: 'AccessTime',
    defaultConfig: {},
  },
  oeeGauge: {
    component: React.lazy(() => import('../types/oee-gauge/index')),
    settingsComponent: React.lazy(() => import('../types/oee-gauge/OeeGaugeWidgetSettings')),
    minW: MIN_W,
    minH: 3,
    defaultW: 3,
    defaultH: 4,
    title: 'OEE Gauge',
    description: 'Displays OEE with availability, performance, and quality metrics',
    category: WIDGET_CATEGORIES.ANALYTICS,
    icon: 'Speed',
    defaultConfig: {},
  },
  oeeTrend: {
    component: React.lazy(() => import('../types/oee-trend/index')),
    settingsComponent: React.lazy(() => import('../types/oee-trend/OeeTrendWidgetSettings')),
    minW: 3,
    minH: 3,
    defaultW: 6,
    defaultH: 4,
    title: 'OEE Trend',
    description: 'Displays OEE metrics over time as a line chart',
    category: WIDGET_CATEGORIES.ANALYTICS,
    icon: 'ShowChart',
    defaultConfig: {
      granularity: 'day',
    },
  },
  alertSummary: {
    component: React.lazy(() => import('../types/alert-summary/AlertSummaryWidget')),
    settingsComponent: null,
    minW: MIN_W,
    minH: MIN_H,
    defaultW: 4,
    defaultH: 6,
    title: 'Alert Summary',
    description: 'Real-time alert summary with severity breakdown',
    category: WIDGET_CATEGORIES.MONITORING,
    icon: 'NotificationsActive',
    defaultConfig: {},
  },
  trendingExplorer: {
    component: React.lazy(() => import('../types/trending-explorer/index')),
    settingsComponent: React.lazy(
      () => import('../types/trending-explorer/TrendingExplorerWidgetSettings'),
    ),
    minW: 4,
    minH: 4,
    defaultW: 6,
    defaultH: 6,
    title: 'Trending Explorer',
    description: 'Explore and compare time-series data from OPC-UA tags',
    category: WIDGET_CATEGORIES.ANALYTICS,
    icon: 'Insights',
    defaultConfig: {
      defaultTags: [],
    },
  },
  spcChart: {
    component: React.lazy(() => import('../types/spc-chart/index')),
    settingsComponent: null,
    minW: 4,
    minH: 4,
    defaultW: 6,
    defaultH: 8,
    title: 'SPC Control Chart',
    description: 'Statistical Process Control chart with UCL/LCL limits',
    category: WIDGET_CATEGORIES.ANALYTICS,
    icon: 'Timeline',
    defaultConfig: {
      profileId: null,
    },
  },
  batchMonitor: {
    component: React.lazy(() => import('../types/batch-monitor/index')),
    settingsComponent: null,
    minW: MIN_W,
    minH: 3,
    defaultW: 4,
    defaultH: 6,
    title: 'Batch Monitor',
    description: 'Monitors active batch with parameter values vs setpoints',
    category: WIDGET_CATEGORIES.PRODUCTION,
    icon: 'Science',
    defaultConfig: {
      machineId: null,
    },
  },
  digitalTwin: {
    component: React.lazy(() => import('../types/digital-twin/index')),
    settingsComponent: null,
    minW: 4,
    minH: 4,
    defaultW: 8,
    defaultH: 8,
    title: 'Digital Twin',
    description: 'Interactive SVG-based digital twin with live data overlay',
    category: WIDGET_CATEGORIES.MONITORING,
    icon: 'ViewInAr',
    defaultConfig: {
      instanceId: null,
    },
  },
};

// Helper function to get widgets by category
export const getWidgetsByCategory = (): Record<string, Array<WidgetMeta & { type: string }>> => {
  const categorized: Record<string, Array<WidgetMeta & { type: string }>> = {};

  Object.entries(widgetRegistry).forEach(([key, widget]) => {
    const category = widget.category || 'Uncategorized';

    // eslint-disable-next-line security/detect-object-injection -- category is from widget.category, not user input
    if (!categorized[category]) {
      // eslint-disable-next-line security/detect-object-injection -- category is from widget.category, not user input
      categorized[category] = [];
    }

    // eslint-disable-next-line security/detect-object-injection -- category is from widget.category, not user input
    categorized[category].push({
      type: key,
      ...widget,
    });
  });

  return categorized;
};

export default widgetRegistry;
