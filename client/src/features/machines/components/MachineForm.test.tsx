import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MachineForm from './MachineForm';
import type { Machine } from '@/types';
it('preserves endpoint and security settings when editing a machine received from the API', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(
    <MachineForm
      open
      onClose={vi.fn()}
      onSubmit={save}
      machine={
        {
          id: 1,
          name: 'Line A',
          ip: 'localhost',
          port: 4841,
          resourcePath: '/UA/LineA',
          securityMode: 'SignAndEncrypt',
          securityPolicy: 'Basic256Sha256',
          isActive: true,
        } as Machine
      }
    />,
  );
  expect(screen.getByLabelText(/Machine Name/)).toHaveValue('Line A');
  expect(screen.getByLabelText(/Resource Path/)).toHaveValue('/UA/LineA');
  fireEvent.change(screen.getByLabelText(/Machine Name/), { target: { value: 'Line B' } });
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Line B',
        resourcePath: '/UA/LineA',
        securityMode: 'SignAndEncrypt',
        isActive: true,
      }),
    ),
  );
});
it('requires name and IP and reports a server save failure', async () => {
  const save = vi.fn().mockRejectedValue(new Error('Cannot save machine'));
  render(<MachineForm open onClose={vi.fn()} onSubmit={save} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByText('Name and IP are required')).toBeVisible();
  expect(save).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText(/Machine Name/), { target: { value: 'Line A' } });
  fireEvent.change(screen.getByLabelText(/IP Address/), { target: { value: 'localhost' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByText('Cannot save machine')).toBeVisible();
});
import React from 'react';

it('rejects invalid ports without submitting or discarding the draft', async () => {
  const save = vi.fn();
  render(<MachineForm open onClose={vi.fn()} onSubmit={save} />);
  fireEvent.change(screen.getByLabelText(/Machine Name/), { target: { value: 'Line A' } });
  fireEvent.change(screen.getByLabelText(/IP Address/), { target: { value: 'localhost' } });
  fireEvent.change(screen.getByLabelText(/Port/), { target: { value: '70000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByText('Port must be between 1 and 65535.')).toBeVisible();
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByLabelText(/Machine Name/)).toHaveValue('Line A');
});
