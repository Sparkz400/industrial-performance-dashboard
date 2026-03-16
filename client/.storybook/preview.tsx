import React from 'react';
import type { Preview } from '@storybook/react';
import { ThemeProvider, CssBaseline, createTheme } from '@mui/material';

const lightTheme = createTheme({ palette: { mode: 'light' } });
const darkTheme = createTheme({ palette: { mode: 'dark' } });

const preview: Preview = {
  parameters: {
    controls: { expanded: true },
    layout: 'centered',
  },
  globalTypes: {
    theme: {
      description: 'Global theme for components',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: ['light', 'dark'],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'light',
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme === 'dark' ? darkTheme : lightTheme;
      return (
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <Story />
        </ThemeProvider>
      );
    },
  ],
};

export default preview;
