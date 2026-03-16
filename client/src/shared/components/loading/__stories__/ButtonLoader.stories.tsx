import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import SaveIcon from '@mui/icons-material/Save';
import ButtonLoader from '../ButtonLoader';

const meta: Meta<typeof ButtonLoader> = {
  title: 'Loading/ButtonLoader',
  component: ButtonLoader,
  args: {
    children: 'Save',
    variant: 'contained',
    color: 'primary',
  },
};

export default meta;
type Story = StoryObj<typeof ButtonLoader>;

export const Default: Story = {};

export const Loading: Story = {
  args: { loading: true, loadingText: 'Saving...' },
};

export const WithIcon: Story = {
  args: { startIcon: <SaveIcon /> },
};

export const LoadingWithIcon: Story = {
  args: { loading: true, loadingText: 'Saving...', startIcon: <SaveIcon /> },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const SmallSize: Story = {
  args: { size: 'small', children: 'Submit' },
};
