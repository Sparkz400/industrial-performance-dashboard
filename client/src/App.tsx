import React, { useEffect, useState, Suspense, useMemo, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Box, CircularProgress, Typography, Button } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import ResponsiveSidebar from './features/layout/components/sidebar';
import ErrorBoundary from './features/system/components/ErrorBoundary';
import CertificateNotification from './features/settings/components/CertificateNotification';
import CsrfErrorHandler from './shared/components/CsrfErrorHandler';
import { useSnackbar, closeSnackbar } from 'notistack';
import { useStatusStore } from './stores/useStatusStore';

// Lazy load pages
const DashboardPage = React.lazy(() => import('./features/dashboard/pages/dashboardPage'));
const SettingsPage = React.lazy(() => import('./features/settings/pages/settingsPage'));
const HelpPage = React.lazy(() => import('./features/help/pages/helpPage'));
const MachinesPage = React.lazy(() => import('./features/machines/pages/MachinesPage'));

// Modern loading component with skeleton
const PageLoader = () => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      gap: 2,
    }}
  >
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #6C63FF, #FF6B9D)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CircularProgress size={24} sx={{ color: '#fff' }} />
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
          Loading...
        </Typography>
      </Box>
    </motion.div>
  </Box>
);

interface ErrorFallbackProps {
  error: Error | null;
  resetErrorBoundary: () => void;
}

// Error fallback component
const ErrorFallback = ({ error, resetErrorBoundary }: ErrorFallbackProps) => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      p: 3,
    }}
  >
    <Typography variant="h4" color="error" gutterBottom>
      Something went wrong
    </Typography>
    <Typography variant="body1" paragraph align="center" sx={{ maxWidth: 500, mb: 3 }}>
      {error?.message || 'An unexpected error occurred. Please try refreshing the page.'}
    </Typography>
    <Button variant="contained" color="primary" onClick={resetErrorBoundary}>
      Try Again
    </Button>
  </Box>
);

interface PageTransitionProps {
  children: React.ReactNode;
}

// Page transition wrapper
const PageTransition = ({ children }: PageTransitionProps) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    transition={{ duration: 0.25, ease: 'easeOut' }}
    style={{ height: '100%' }}
  >
    {children}
  </motion.div>
);

/**
 *
 */
function App() {
  const [sidebarOpen, setSidebarOpen] = useState(localStorage.getItem('sidebarOpen') !== 'false');
  const [drawerWidth, setDrawerWidth] = useState(0);

  const isError = useStatusStore((s) => s.isError);
  const { enqueueSnackbar } = useSnackbar();

  useEffect(() => {
    localStorage.setItem('sidebarOpen', sidebarOpen.toString());
  }, [sidebarOpen]);

  useEffect(() => {
    const snackbarKey = 'system-connection-error';
    if (isError) {
      closeSnackbar(snackbarKey);
      enqueueSnackbar('System connection issue detected', {
        variant: 'error',
        persist: true,
        key: snackbarKey,
      });
    } else {
      closeSnackbar(snackbarKey);
    }
  }, [isError, enqueueSnackbar]);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const contentBoxStyles = useMemo(
    () => ({
      flexGrow: 1,
      ml: `${drawerWidth}px`,
      transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      overflowX: 'hidden' as const,
      overflowY: 'auto' as const,
      height: '100vh',
      display: 'flex',
      flexDirection: 'column' as const,
    }),
    [drawerWidth],
  );

  return (
    <Router>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <Box sx={{ display: 'flex', minHeight: '100vh' }}>
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <ResponsiveSidebar
              open={sidebarOpen}
              onToggle={toggleSidebar}
              onWidthChange={setDrawerWidth}
            />
          </ErrorBoundary>

          <Box component="main" sx={contentBoxStyles}>
            <ErrorBoundary FallbackComponent={ErrorFallback}>
              <Suspense fallback={<PageLoader />}>
                <AnimatePresence mode="wait">
                  <Routes>
                    <Route
                      path="/"
                      element={
                        <PageTransition>
                          <DashboardPage />
                        </PageTransition>
                      }
                    />
                    <Route
                      path="/dashboard/:id"
                      element={
                        <PageTransition>
                          <DashboardPage />
                        </PageTransition>
                      }
                    />
                    <Route
                      path="/machines"
                      element={
                        <PageTransition>
                          <MachinesPage />
                        </PageTransition>
                      }
                    />
                    <Route
                      path="/settings"
                      element={
                        <PageTransition>
                          <SettingsPage />
                        </PageTransition>
                      }
                    />
                    <Route
                      path="/help"
                      element={
                        <PageTransition>
                          <HelpPage />
                        </PageTransition>
                      }
                    />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </AnimatePresence>
              </Suspense>
            </ErrorBoundary>
          </Box>
        </Box>
      </ErrorBoundary>

      <CertificateNotification />
      <CsrfErrorHandler />
    </Router>
  );
}

export default App;
