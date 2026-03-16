import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Box } from '@mui/material';
import WidgetSkeleton from '../WidgetSkeleton';

const meta: Meta<typeof WidgetSkeleton> = {
  title: 'Loading/WidgetSkeleton',
  component: WidgetSkeleton,
  decorators: [
    (Story) => (
      <Box
        sx={{
          width: 400,
          height: 300,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
        }}
      >
        <Story />
      </Box>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof WidgetSkeleton>;

export const Default: Story = { args: { variant: 'default' } };
export const Chart: Story = { args: { variant: 'chart' } };
export const Table: Story = { args: { variant: 'table' } };
export const Status: Story = { args: { variant: 'status' } };

export const AllVariants: Story = {
  render: () => (
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, width: 820 }}>
      {(['default', 'chart', 'table', 'status'] as const).map((variant) => (
        <Box
          key={variant}
          sx={{ height: 250, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
        >
          <WidgetSkeleton variant={variant} />
        </Box>
      ))}
    </Box>
  ),
};
