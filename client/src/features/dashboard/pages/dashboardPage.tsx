import { useT, translate as t } from '@/i18n';
import { useAuthStore } from '@/stores/useAuthStore';
import React, { useCallback, useRef, useMemo, useState } from 'react';
import {
  CircularProgress,
  Box,
  Typography,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Button,
  alpha,
} from '@mui/material';
import { Responsive, WidthProvider } from 'react-grid-layout/legacy';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { motion, AnimatePresence } from 'framer-motion';
import { useSnackbar } from 'notistack';

import WidgetContainer, { type LayoutNudge } from '../../widgets/components/WidgetContainer';
import { ButtonLoader, LoadingOverlay } from '@/shared/components/loading/index';
import KpiSummaryBar from '../components/KpiSummaryBar';
import DashboardTemplates from '../components/DashboardTemplates';
import DashboardToolbar from '../components/DashboardToolbar';
import WidgetManagementPanel from '../components/WidgetManagementPanel';

import { useDashboardState, ActionTypes } from '../hooks/useDashboardState';
import { useDashboardOperations } from '../hooks/useDashboardOperations';

import type { LayoutItem } from '@/types';

const ResponsiveGridLayout = WidthProvider(Responsive);

// --- Error Boundary Types ---
interface GridErrorBoundaryProps {
  children: React.ReactNode;
}

interface GridErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Error boundary for the grid layout
class GridErrorBoundary extends React.Component<GridErrorBoundaryProps, GridErrorBoundaryState> {
  constructor(props: GridErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): GridErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Grid layout error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            p: 4,
          }}
        >
          <Typography variant="h6" color="error" gutterBottom>
            {t('Dashboard layout error')}
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            {this.state.error?.message || 'An error occurred rendering the dashboard grid.'}
          </Typography>
          <Button
            variant="contained"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            {t('Retry')}
          </Button>
        </Box>
      );
    }
    return this.props.children;
  }
}

// --- Dashboard Component ---
/**
 *
 */
function DashboardPageInternal(): React.JSX.Element {
  const t = useT();

  const editable = useAuthStore((s) => s.user?.role === 'admin');
  const { state, dispatch } = useDashboardState();
  const {
    widgets,
    layout,
    updateLayout,
    loadInitialDashboards,
    handleAddDashboard,
    handleApplyTemplate,
    initiateDeleteDashboard,
    handleCloseConfirmDelete,
    handleConfirmDeleteDashboard,
    handleSelectDashboard,
    handleRenameDashboard,
    handleAddWidget,
    handleRemoveWidget,
    handleDrop,
    handleDragOver,
    syncWithServer,
    autoSync,
    setAutoSync,
  } = useDashboardOperations({ state, dispatch });

  const { enqueueSnackbar } = useSnackbar();
  const [templateDialogOpen, setTemplateDialogOpen] = useState<boolean>(false);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const layoutMap = useMemo(() => {
    const map = new Map<string, LayoutItem>();
    if (Array.isArray(layout)) {
      layout.forEach((item) => map.set(item.i, item));
    }
    return map;
  }, [layout]);

  // Menu alternative to dragging; the grid resolves any overlap it creates.
  const handleNudge = useCallback(
    (id: string, change: LayoutNudge) =>
      updateLayout(
        layout.map((item) => {
          if (item.i !== id) return item;
          const w = Math.min(
            item.maxW ?? 12,
            12,
            Math.max(item.minW ?? 1, item.w + (change.w ?? 0)),
          );
          const h = Math.min(
            item.maxH ?? Infinity,
            Math.max(item.minH ?? 1, item.h + (change.h ?? 0)),
          );
          return {
            ...item,
            w,
            h,
            x: Math.min(12 - w, Math.max(0, item.x + (change.x ?? 0))),
            y: Math.max(0, item.y + (change.y ?? 0)),
          };
        }),
      ),
    [layout, updateLayout],
  );

  const commonWidgetData = useMemo(
    () => ({
      dashboardId: state.selectedDashboardId,
    }),
    [state.selectedDashboardId],
  );

  const selectedIndex = useMemo(
    () => state.dashboards.findIndex((d) => d.id === state.selectedDashboardId),
    [state.dashboards, state.selectedDashboardId],
  );

  const dashboardNameToDelete = useMemo(
    () =>
      state.dashboards.find((d) => d.id === state.dashboardToDeleteId)?.name || 'this dashboard',
    [state.dashboards, state.dashboardToDeleteId],
  );

  // Loading state
  if (!state.initialized && state.isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
        >
          <CircularProgress color="secondary" sx={{ mb: 3 }} />
          <Typography variant="h6" color="textSecondary">
            {t('Loading Dashboards...')}
          </Typography>
        </motion.div>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* KPI Summary Bar */}
      {editable && <KpiSummaryBar />}

      {/* Dashboard Header with Tabs, Time Range, Controls */}
      <DashboardToolbar
        dashboards={state.dashboards}
        selectedIndex={selectedIndex}
        selectedDashboardId={state.selectedDashboardId}
        editingDashboardId={state.editingDashboardId}
        isLoading={state.isLoading}
        isSaving={state.isSaving}
        hasLocalChanges={state.hasLocalChanges}
        serverSyncStatus={state.serverSyncStatus}
        autoSync={autoSync}
        widgets={widgets}
        layout={layout}
        onSelectDashboard={handleSelectDashboard}
        onEditName={handleRenameDashboard}
        onDeleteDashboard={initiateDeleteDashboard}
        onSyncWithServer={syncWithServer}
        onAddDashboard={handleAddDashboard}
        onAutoSyncChange={setAutoSync}
        onOpenTemplates={() => setTemplateDialogOpen(true)}
        onDashboardImported={(imported: { name: string }) => {
          loadInitialDashboards();
          enqueueSnackbar(`Dashboard "${imported.name}" imported`, { variant: 'success' });
        }}
      />

      {/* Grid Layout with Widgets - Drop Zone */}
      <Box
        ref={gridRef}
        onDrop={editable ? handleDrop : undefined}
        onDragOver={editable ? handleDragOver : undefined}
        sx={{ flexGrow: 1, p: 2, overflow: 'auto', position: 'relative' }}
      >
        {state.dashboards.length > 0 && state.selectedDashboardId && (
          <GridErrorBoundary>
            <ResponsiveGridLayout
              isDraggable={editable}
              isResizable={editable}
              draggableCancel=".MuiIconButton-root, .no-drag"
              className="layout"
              layouts={{ lg: layout, md: layout, sm: layout, xs: layout, xxs: layout }}
              breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
              cols={{ lg: 12, md: 12, sm: 12, xs: 12, xxs: 12 }}
              rowHeight={35}
              onLayoutChange={(currentLayout: readonly LayoutItem[]) => {
                if (!editable) return;
                const normalize = (items: readonly LayoutItem[]) =>
                  items
                    .map(({ i, x, y, w, h, minW, minH, maxW, maxH }) => ({
                      i,
                      x,
                      y,
                      w,
                      h,
                      minW,
                      minH,
                      maxW,
                      maxH,
                    }))
                    .sort((a, b) => a.i.localeCompare(b.i));
                const oldStr = JSON.stringify(normalize(layout));
                const newStr = JSON.stringify(normalize(currentLayout));
                if (oldStr !== newStr) {
                  updateLayout([...currentLayout]);
                }
              }}
              margin={[16, 16]}
              containerPadding={[0, 0]}
            >
              {(widgets || []).map((widget) => {
                const layoutItem = layoutMap.get(widget.id);
                return (
                  <div key={widget.id}>
                    <WidgetContainer
                      readOnly={!editable}
                      widget={widget}
                      onDelete={handleRemoveWidget}
                      onNudge={handleNudge}
                      layoutItem={layoutItem}
                      commonData={commonWidgetData}
                    />
                  </div>
                );
              })}
            </ResponsiveGridLayout>
          </GridErrorBoundary>
        )}

        {editable && (
          <WidgetManagementPanel
            hasDashboards={state.dashboards.length > 0}
            hasWidgets={widgets.length > 0}
            initialized={state.initialized}
            previewOpen={state.previewOpen}
            onOpenPreview={() => dispatch({ type: ActionTypes.SET_PREVIEW_OPEN, payload: true })}
            onClosePreview={() => dispatch({ type: ActionTypes.SET_PREVIEW_OPEN, payload: false })}
            onAddWidget={handleAddWidget}
            onOpenTemplates={() => setTemplateDialogOpen(true)}
          />
        )}
      </Box>

      {/* Dashboard Templates Dialog */}
      <DashboardTemplates
        open={templateDialogOpen}
        onClose={() => setTemplateDialogOpen(false)}
        onApplyTemplate={handleApplyTemplate}
      />

      {/* Loading Overlay */}
      <LoadingOverlay
        open={state.isSaving || state.serverSyncStatus === 'syncing'}
        message="Saving..."
        fullPage={false}
        zIndex={1100}
      />

      {/* Unsaved Changes Indicator */}
      <AnimatePresence>
        {state.hasLocalChanges && !state.isSaving && (
          <Box
            component={motion.div}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3 }}
            style={{ x: '-50%' }}
            sx={{
              position: 'fixed',
              bottom: { xs: 80, sm: 20 },
              left: '50%',
              width: 'max-content',
              maxWidth: 'calc(100vw - 32px)',
              zIndex: 1000,
            }}
          >
            <Box
              sx={{
                bgcolor: 'background.paper',
                boxShadow: (theme) => `0 8px 32px ${alpha(theme.palette.common.black, 0.3)}`,
                borderRadius: 1,
                p: 1.5,
                display: 'flex',
                alignItems: 'center',
                border: '1px solid',
                borderColor: 'warning.main',
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  color: 'text.secondary',
                  mr: 2,
                }}
              >
                {t('Unsaved changes')}
              </Typography>
              <ButtonLoader
                variant="contained"
                size="small"
                onClick={syncWithServer}
                loading={state.isSaving || state.serverSyncStatus === 'syncing'}
              >
                {t('Save Now')}
              </ButtonLoader>
            </Box>
          </Box>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Dialog */}
      <Dialog open={state.confirmDeleteDialogOpen} onClose={handleCloseConfirmDelete}>
        <DialogTitle>{t('Confirm Deletion')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('Are you sure you want to delete the dashboard "')}
            {dashboardNameToDelete}
            {t('"? This action cannot be undone.')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseConfirmDelete} color="primary">
            {t('Cancel')}
          </Button>
          <Button onClick={handleConfirmDeleteDashboard} color="error" autoFocus>
            {t('Delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/**
 *
 */
function DashboardPage(): React.JSX.Element {
  return <DashboardPageInternal />;
}

export default DashboardPage;
