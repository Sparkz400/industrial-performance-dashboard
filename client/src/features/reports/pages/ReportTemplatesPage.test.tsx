import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReportTemplatesPage from './ReportTemplatesPage';

const mocks = vi.hoisted(() => ({ request: vi.fn(), fetchMachines: vi.fn() }));
vi.mock('@/utils/protectedFetch', () => ({ default: mocks.request }));
vi.mock('@/stores/useMachineStore', () => ({
  useMachineStore: (
    select: (state: { machines: never[]; fetchMachines: typeof mocks.fetchMachines }) => unknown,
  ) => select({ machines: [], fetchMachines: mocks.fetchMachines }),
}));
let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.clearAllMocks();
});
const open = () =>
  render(
    <QueryClientProvider client={client}>
      <ReportTemplatesPage />
    </QueryClientProvider>,
  );
const submitted = (method: string) => {
  const call = mocks.request.mock.calls.find(([, options]) => options?.method === method);
  expect(call).toBeDefined();
  return JSON.parse(call![1].body);
};

it('preserves repeated machine sections and legacy configuration when editing a template', async () => {
  const config = {
    title: 'Existing title',
    lookbackHours: 168,
    custom: { revision: 4 },
    sections: [
      { type: 'alerts', machineId: 1, title: 'Line one' },
      { type: 'alerts', machineId: 2, title: 'Line two' },
      { type: 'legacy-chart', custom: true },
    ],
  };
  const template = {
    id: 3,
    name: 'Weekly',
    type: 'weekly',
    description: 'Original',
    isActive: true,
    templateConfig: config,
  };
  mocks.request.mockImplementation(
    async (_url, options) => new Response(JSON.stringify(options?.method ? template : [template])),
  );
  open();
  fireEvent.click(await screen.findByLabelText('Edit template'));
  const dialog = within(screen.getByRole('dialog'));
  expect(dialog.getByText(/legacy sections/)).toBeVisible();
  fireEvent.change(dialog.getByLabelText('Description'), {
    target: { value: 'Edited description' },
  });
  fireEvent.click(dialog.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(submitted('PUT')).toEqual({
      name: 'Weekly',
      type: 'weekly',
      description: 'Edited description',
      isActive: true,
      templateConfig: config,
    }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('validates the name and saves trend signals and the reporting window under templateConfig', async () => {
  mocks.request.mockImplementation(
    async (_url, options) => new Response(JSON.stringify(options?.method ? { id: 1 } : [])),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Create Template' }));
  const dialog = within(screen.getByRole('dialog'));
  fireEvent.click(dialog.getByRole('button', { name: 'Save' }));
  expect(dialog.getByText('Name is required')).toBeVisible();
  expect(mocks.request.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  fireEvent.change(dialog.getByLabelText(/^Name/), { target: { value: 'Measured trends' } });
  fireEvent.change(dialog.getByLabelText('Report title'), { target: { value: 'Prüfstand Δ' } });
  fireEvent.change(dialog.getByLabelText('Reporting window (hours)'), { target: { value: '8' } });
  fireEvent.click(dialog.getByLabelText('Trending Data'));
  const signals = dialog.getByLabelText('Trend signals');
  fireEvent.change(signals, { target: { value: 'Counter, Temperature, ' } });
  fireEvent.blur(signals);
  fireEvent.click(dialog.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(submitted('POST')).toEqual({
      name: 'Measured trends',
      type: 'daily',
      description: '',
      isActive: true,
      templateConfig: {
        title: 'Prüfstand Δ',
        lookbackHours: 8,
        sections: [{ type: 'trending', nodeKeys: ['Counter', 'Temperature'] }],
      },
    }),
  );
});
