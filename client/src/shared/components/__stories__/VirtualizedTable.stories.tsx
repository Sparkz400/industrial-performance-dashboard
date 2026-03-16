import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Box, Chip } from '@mui/material';
import VirtualizedTable from '../VirtualizedTable';
import type { VirtualizedColumn } from '../VirtualizedTable';

interface SampleRow {
  id: number;
  name: string;
  status: 'active' | 'inactive' | 'error';
  value: number;
  timestamp: string;
}

const generateRows = (count: number): SampleRow[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Machine ${i + 1}`,
    status: (['active', 'inactive', 'error'] as const)[i % 3],
    value: Math.round(Math.random() * 1000) / 10,
    timestamp: new Date(Date.now() - i * 60000).toLocaleString(),
  }));

const columns: VirtualizedColumn<SampleRow>[] = [
  { key: 'id', header: 'ID', width: 60, render: (row) => row.id },
  { key: 'name', header: 'Name', render: (row) => row.name },
  {
    key: 'status',
    header: 'Status',
    width: 120,
    render: (row) => (
      <Chip
        label={row.status}
        size="small"
        color={row.status === 'active' ? 'success' : row.status === 'error' ? 'error' : 'default'}
      />
    ),
  },
  { key: 'value', header: 'Value', width: 100, render: (row) => row.value.toFixed(1) },
  { key: 'timestamp', header: 'Last Update', width: 200, render: (row) => row.timestamp },
];

const meta: Meta<typeof VirtualizedTable<SampleRow>> = {
  title: 'Components/VirtualizedTable',
  decorators: [
    (Story) => (
      <Box sx={{ width: 800, height: 500 }}>
        <Story />
      </Box>
    ),
  ],
};

export default meta;

export const SmallDataset: StoryObj = {
  render: () => (
    <VirtualizedTable rows={generateRows(10)} columns={columns} getRowKey={(row) => row.id} />
  ),
};

export const LargeDataset: StoryObj = {
  render: () => (
    <VirtualizedTable rows={generateRows(1000)} columns={columns} getRowKey={(row) => row.id} />
  ),
};

export const Empty: StoryObj = {
  render: () => (
    <VirtualizedTable
      rows={[] as SampleRow[]}
      columns={columns}
      getRowKey={(row) => row.id}
      emptyMessage="No machines found"
    />
  ),
};
