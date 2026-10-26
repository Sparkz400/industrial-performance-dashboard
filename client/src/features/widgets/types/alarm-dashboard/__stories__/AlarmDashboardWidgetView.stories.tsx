import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Box } from '@mui/material';
import AlarmDashboardWidgetView from '../AlarmDashboardWidgetView';
import type { Alarm } from '../useAlarmData';

const sampleAlarms: Alarm[] = [
  {
    id: 1,
    ruleId: 1,
    ruleName: 'Temperature Threshold',
    machineId: 1,
    nodeKey: 'Temperature',
    severity: 'critical',
    status: 'active',
    message: 'Temperature exceeds threshold',
    triggerValue: 95,
    threshold: 80,
    acknowledgedBy: null,
    acknowledgedAt: null,
    resolvedAt: null,
    metadata: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: 2,
    ruleId: 2,
    ruleName: 'Pressure Monitor',
    machineId: 1,
    nodeKey: 'Pressure',
    severity: 'high',
    status: 'active',
    message: 'Pressure drop detected',
    triggerValue: 30,
    threshold: 50,
    acknowledgedBy: null,
    acknowledgedAt: null,
    resolvedAt: null,
    metadata: null,
    createdAt: new Date(Date.now() - 300000).toISOString(),
  },
  {
    id: 3,
    ruleId: 3,
    ruleName: 'Vibration Check',
    machineId: 2,
    nodeKey: 'Vibration',
    severity: 'medium',
    status: 'acknowledged',
    message: 'Motor vibration warning',
    triggerValue: 12,
    threshold: 10,
    acknowledgedBy: 1,
    acknowledgedAt: new Date().toISOString(),
    resolvedAt: null,
    metadata: null,
    createdAt: new Date(Date.now() - 600000).toISOString(),
  },
  {
    id: 4,
    ruleId: 4,
    ruleName: 'Air Flow',
    machineId: 1,
    nodeKey: 'AirFlow',
    severity: 'low',
    status: 'resolved',
    message: 'Air flow reduced',
    triggerValue: 5,
    threshold: 10,
    acknowledgedBy: null,
    acknowledgedAt: null,
    resolvedAt: new Date().toISOString(),
    metadata: null,
    createdAt: new Date(Date.now() - 900000).toISOString(),
  },
  {
    id: 5,
    ruleId: null,
    ruleName: 'System',
    machineId: null,
    nodeKey: null,
    severity: 'info',
    status: 'resolved',
    message: 'Routine check completed',
    triggerValue: 0,
    threshold: 0,
    acknowledgedBy: null,
    acknowledgedAt: null,
    resolvedAt: new Date().toISOString(),
    metadata: null,
    createdAt: new Date(Date.now() - 1200000).toISOString(),
  },
];

const meta: Meta<typeof AlarmDashboardWidgetView> = {
  title: 'Widgets/AlarmDashboard',
  component: AlarmDashboardWidgetView,
  decorators: [
    (Story) => (
      <Box
        sx={{
          width: 700,
          height: 450,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
        }}
      >
        <Story />
      </Box>
    ),
  ],
  args: {
    onAcknowledge: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof AlarmDashboardWidgetView>;

export const WithAlarms: Story = {
  args: { alarms: sampleAlarms, loading: false, error: null },
};

export const Loading: Story = {
  args: { alarms: [], loading: true, error: null },
};

export const Error: Story = {
  args: { alarms: [], loading: false, error: 'Failed to fetch alarm data from server' },
};

export const Empty: Story = {
  args: { alarms: [], loading: false, error: null },
};
