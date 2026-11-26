import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
vi.mock('./productionApi', () => ({
  productionRequest: vi.fn(async () => [
    { id: 1, category: 'unplanned', label: 'Jam at infeed', active: true },
    { id: 2, category: 'unplanned', label: 'Old reason', active: false },
    { id: 3, category: 'planned', label: 'Cleaning', active: true },
  ]),
}));
import { ReasonPicker } from './ReasonCatalog';

it('attaches the code when the operator enters a listed reason, free text otherwise', async () => {
  const onChange = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ReasonPicker category="unplanned" reason="" onChange={onChange} />
    </QueryClientProvider>,
  );
  const input = await screen.findByRole('combobox');
  await screen.findByText('Pick a listed reason or describe the stop');
  fireEvent.change(input, { target: { value: 'Jam at infeed' } });
  expect(onChange).toHaveBeenLastCalledWith({ reason: 'Jam at infeed', codeId: 1 });
  fireEvent.change(input, { target: { value: 'Old reason' } });
  expect(onChange).toHaveBeenLastCalledWith({ reason: 'Old reason', codeId: null });
  fireEvent.change(input, { target: { value: 'Cleaning' } });
  expect(onChange).toHaveBeenLastCalledWith({ reason: 'Cleaning', codeId: null });
});
