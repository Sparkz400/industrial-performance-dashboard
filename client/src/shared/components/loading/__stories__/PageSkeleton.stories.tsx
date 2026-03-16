import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Box } from '@mui/material';
import PageSkeleton from '../PageSkeleton';

const meta: Meta<typeof PageSkeleton> = {
  title: 'Loading/PageSkeleton',
  component: PageSkeleton,
  decorators: [
    (Story) => (
      <Box sx={{ width: 800, p: 2 }}>
        <Story />
      </Box>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof PageSkeleton>;

export const Default: Story = { args: { variant: 'default' } };
export const Cards: Story = { args: { variant: 'cards', count: 6 } };
export const TableView: Story = { args: { variant: 'table', count: 8 } };
