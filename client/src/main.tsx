/* eslint-disable react-refresh/only-export-components */
import React, { useMemo, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { CsrfProvider } from './utils/csrfContext';
import { SnackbarProvider, SnackbarKey } from 'notistack';
import { IconButton } from '@mui/material';
import { ThemeProvider as MuiThemeProvider, CssBaseline } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { QueryProvider } from './providers/QueryProvider';
import { useThemeStore } from './stores/useThemeStore';
import { useStatusStore } from './stores/useStatusStore';
import { createModernTheme } from './theme/modernTheme';

const notistackRef = React.createRef<SnackbarProvider>();
const onClickDismiss = (key: SnackbarKey) => () => {
  if (notistackRef.current) {
    notistackRef.current.closeSnackbar(key);
  }
};

interface ThemeWrapperProps {
  children: React.ReactNode;
}

// Theme wrapper that uses Zustand
const ThemeWrapper = ({ children }: ThemeWrapperProps) => {
  const themeMode = useThemeStore((s) => s.themeMode);
  const theme = useMemo(() => createModernTheme(themeMode), [themeMode]);

  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  );
};

interface StatusInitializerProps {
  children: React.ReactNode;
}

// Status initializer
const StatusInitializer = ({ children }: StatusInitializerProps) => {
  const initSocket = useStatusStore((s) => s.initSocket);
  const cleanup = useStatusStore((s) => s.cleanup);

  useEffect(() => {
    initSocket();
    return () => cleanup();
  }, [initSocket, cleanup]);

  return children;
};

const container = document.getElementById('root');
const root = createRoot(container!);

root.render(
  <React.StrictMode>
    <CsrfProvider>
      <StatusInitializer>
        <ThemeWrapper>
          <QueryProvider>
            <SnackbarProvider
              ref={notistackRef}
              maxSnack={5}
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'right',
              }}
              autoHideDuration={4000}
              action={(key: SnackbarKey) => (
                <IconButton
                  size="small"
                  aria-label="close"
                  color="inherit"
                  onClick={onClickDismiss(key)}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              )}
            >
              <App />
            </SnackbarProvider>
          </QueryProvider>
        </ThemeWrapper>
      </StatusInitializer>
    </CsrfProvider>
  </React.StrictMode>,
);
