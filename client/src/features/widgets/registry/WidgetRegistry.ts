import React from 'react';
import type { WidgetMeta, WidgetRegistry as WidgetRegistryType } from '@/types';

// Widget categories for better organization
export const WIDGET_CATEGORIES: Record<string, string> = {
  MONITORING: 'Monitoring',
  ANALYTICS: 'Analytics',
  SYSTEM: 'System',
  CONTROL: 'Control',
};

// Category color palette for visual distinction
export interface CategoryColor {
  main: string;
  light: string;
  dark: string;
}

export const CATEGORY_COLORS: Record<string, CategoryColor> = {
  [WIDGET_CATEGORIES.MONITORING]: { main: '#ef5350', light: '#ffebee', dark: '#c62828' },
  [WIDGET_CATEGORIES.ANALYTICS]: { main: '#7c4dff', light: '#ede7f6', dark: '#4a148c' },
  [WIDGET_CATEGORIES.SYSTEM]: { main: '#26a69a', light: '#e0f2f1', dark: '#00695c' },
  [WIDGET_CATEGORIES.CONTROL]: { main: '#ffa726', light: '#fff3e0', dark: '#e65100' },
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
    settingsComponent: null,
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
    settingsComponent: null,
    minW: MIN_W,
    minH: MIN_H,
    defaultW: 4,
    defaultH: 10,
    title: 'Operation Mode Pie',
    description: 'Shows operation mode distribution as a pie chart',
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
    defaultConfig: {
      expectedUptime: 99,
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
