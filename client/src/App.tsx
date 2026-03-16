import React, { useEffect, useState, Suspense, useMemo, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Box, CircularProgress, Typography, Button } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import ResponsiveSidebar from './features/layout/components/sidebar';
import ErrorBoundary from './features/system/components/ErrorBoundary';
import CertificateNotification from './features/settings/components/CertificateNotification';
import CsrfErrorHandler from './shared/components/CsrfErrorHandler';
import PrivateRoute from './shared/components/PrivateRoute';
import { useSnackbar, closeSnackbar } from 'notistack';
import { useStatusStore } from './stores/useStatusStore';
import { useAuthStore } from './stores/useAuthStore';

// Lazy load pages
const LoginPage = React.lazy(() => import('./features/auth/pages/LoginPage'));
const DashboardPage = React.lazy(() => import('./features/dashboard/pages/dashboardPage'));
const SettingsPage = React.lazy(() => import('./features/settings/pages/settingsPage'));
const HelpPage = React.lazy(() => import('./features/help/pages/helpPage'));
const MachinesPage = React.lazy(() => import('./features/machines/pages/MachinesPage'));
const EmbedPage = React.lazy(() => import('./features/embed/pages/EmbedPage'));
const NLQueryPanel = React.lazy(() => import('./features/nl-query/components/NLQueryPanel'));

// Tier 1 feature pages
const PlantsPage = React.lazy(() => import('./features/plants/pages/PlantsPage'));
const OeeConfigPage = React.lazy(() => import('./features/oee/pages/OeeConfigPage'));
const AlertRulesPage = React.lazy(() => import('./features/alerts/pages/AlertRulesPage'));
const AlertHistoryPage = React.lazy(() => import('./features/alerts/pages/AlertHistoryPage'));
const NotificationChannelsPage = React.lazy(
  () => import('./features/alerts/pages/NotificationChannelsPage'),
);
const ReportTemplatesPage = React.lazy(
  () => import('./features/reports/pages/ReportTemplatesPage'),
);
const ReportSchedulesPage = React.lazy(
  () => import('./features/reports/pages/ReportSchedulesPage'),
);
const ReportHistoryPage = React.lazy(() => import('./features/reports/pages/ReportHistoryPage'));

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

  const user = useAuthStore((s) => s.user);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const checkAuth = useAuthStore((s) => s.checkAuth);

  const logout = useAuthStore((s) => s.logout);

  // Check authentication on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Listen for session expiry (401 from API)
  useEffect(() => {
    const handleUnauthorized = () => {
      logout();
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [logout]);

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

  // Show loader while checking authentication
  if (!isInitialized) {
    return <PageLoader />;
  }

  // If not logged in, show login + public routes (shared/embed dashboards)
  if (!user) {
    return (
      <Router>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/shared/:token" element={<EmbedPage mode="shared" />} />
            <Route path="/embed/:token" element={<EmbedPage mode="embed" />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>
      </Router>
    );
  }

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
                        <PrivateRoute requiredRole="admin">
                          <PageTransition>
                            <MachinesPage />
                          </PageTransition>
                        </PrivateRoute>
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
                    {/* Tier 1: Multi-plant */}
                    <Route
                      path="/plants"
                      element={
                        <PrivateRoute requiredRole="admin">
                          <PageTransition>
                            <PlantsPage />
                          </PageTransition>
                        </PrivateRoute>
                      }
                    />
                    {/* Tier 1: OEE */}
                    <Route
                      path="/oee/config"
                      element={
                        <PrivateRoute requiredRole="admin">
                          <PageTransition>
                            <OeeConfigPage />
                          </PageTransition>
                        </PrivateRoute>
                      }
                    />
                    {/* Tier 1: Alerts */}
                    <Route
                      path="/alerts/rules"
                      element={
                        <PrivateRoute requiredRole="admin">
                          <PageTransition>
                            <AlertRulesPage />
                          </PageTransition>
                        </PrivateRoute>
                      }
                    />
                    <Route
                      path="/alerts/history"
                      element={
                        <PageTransition>
                          <AlertHistoryPage />
                        </PageTransition>
                      }
                    />
                    <Route
                      path="/alerts/channels"
                      element={
                        <PrivateRoute requiredRole="admin">
                          <PageTransition>
                            <NotificationChannelsPage />
                          </PageTransition>
                        </PrivateRoute>
                      }
                    />
                    {/* Tier 1: Reports */}
                    <Route
                      path="/reports/templates"
                      element={
                        <PrivateRoute requiredRole="admin">
                          <PageTransition>
                            <ReportTemplatesPage />
                          </PageTransition>
                        </PrivateRoute>
                      }
                    />
                    <Route
                      path="/reports/schedules"
                      element={
                        <PrivateRoute requiredRole="admin">
                          <PageTransition>
                            <ReportSchedulesPage />
                          </PageTransition>
                        </PrivateRoute>
                      }
                    />
                    <Route
                      path="/reports/history"
                      element={
                        <PageTransition>
                          <ReportHistoryPage />
                        </PageTransition>
                      }
                    />
                    <Route path="/shared/:token" element={<EmbedPage mode="shared" />} />
                    <Route path="/embed/:token" element={<EmbedPage mode="embed" />} />
                    <Route path="/login" element={<Navigate to="/" replace />} />
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
      <Suspense fallback={null}>
        <NLQueryPanel />
      </Suspense>
    </Router>
  );
}

export default App;
