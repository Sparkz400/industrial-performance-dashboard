import React, { useState, memo, Suspense, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  Typography,
  Button,
  DialogActions,
  Tooltip,
  Fade,
  Box,
} from '@mui/material';
import WidgetSkeleton from '@/shared/components/loading/WidgetSkeleton';
import DeleteIcon from '@mui/icons-material/Delete';
import SettingsIcon from '@mui/icons-material/Settings';
import ErrorIcon from '@mui/icons-material/Error';
import RefreshIcon from '@mui/icons-material/Refresh';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import { motion } from 'framer-motion';
import { useWidgetStore } from '@/stores/useWidgetStore';
import { widgetRegistry } from '../registry/WidgetRegistry';
import type { Widget, WidgetConfig, WidgetMeta, LayoutItem } from '@/types';
import ExportMenu from '../../dashboard/components/ExportMenu';
import AnnotationPanel from '../../dashboard/components/AnnotationPanel';

// ErrorFallback props
interface ErrorFallbackProps {
  error: Error | null;
  resetErrorBoundary: () => void;
}

// Separate error fallback component
const ErrorFallback = memo<ErrorFallbackProps>(({ error, resetErrorBoundary }) => (
  <Box
    sx={{
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      textAlign: 'center',
    }}
  >
    <ErrorIcon color="error" sx={{ fontSize: 48, mb: 2 }} />
    <Typography variant="h6" color="error" gutterBottom>
      Widget Error
    </Typography>
    <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
      {error?.message || 'An error occurred while loading this widget'}
    </Typography>
    <Button
      variant="contained"
      startIcon={<RefreshIcon />}
      onClick={resetErrorBoundary}
      size="small"
    >
      Retry
    </Button>
  </Box>
));
ErrorFallback.displayName = 'ErrorFallback';

// Skeleton loader for widget suspense fallback
const WidgetLoader = memo(() => <WidgetSkeleton variant="default" />);
WidgetLoader.displayName = 'WidgetLoader';

// Custom error boundary for widget content
interface WidgetErrorBoundaryProps {
  widgetId: string;
  onError?: (error: Error) => void;
  children: React.ReactNode;
}

interface WidgetErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class WidgetErrorBoundary extends React.Component<
  WidgetErrorBoundaryProps,
  WidgetErrorBoundaryState
> {
  constructor(props: WidgetErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): WidgetErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(`Error in widget ${this.props.widgetId}:`, error, info);
    if (typeof this.props.onError === 'function') {
      this.props.onError(error);
    }
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} resetErrorBoundary={this.reset} />;
    }
    return this.props.children;
  }
}

// Settings Dialog props
interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  widget: Widget;
  onConfigChange: (newConfig: WidgetConfig) => void;
}

// Settings Dialog component
const SettingsDialog = memo<SettingsDialogProps>(({ open, onClose, widget, onConfigChange }) => {
  const widgetMeta = widgetRegistry[widget.type] || ({} as Partial<WidgetMeta>);
  const CustomSettingsComponent = widgetMeta.settingsComponent;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" className="no-drag">
      <DialogTitle>{widgetMeta.title || widget.type} Settings</DialogTitle>
      <DialogContent dividers>
        {CustomSettingsComponent ? (
          <Suspense fallback={<WidgetLoader />}>
            <CustomSettingsComponent config={widget.config || {}} onConfigChange={onConfigChange} />
          </Suspense>
        ) : (
          <Typography variant="body1">No custom settings available for this widget.</Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained" color="primary">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
});
SettingsDialog.displayName = 'SettingsDialog';

// Widget Container props
interface WidgetContainerProps {
  widget: Widget;
  readOnly?: boolean;
  onDelete: (id: string) => void;
  layoutItem?: LayoutItem;
  commonData?: Record<string, unknown>;
}

// Main Widget Container with industrial surfaces, fullscreen, export, and animation
const WidgetContainer = memo<WidgetContainerProps>(
  ({ widget, onDelete, layoutItem, commonData, readOnly = false }) => {
    const updateWidgetConfig = useWidgetStore((s) => s.updateWidgetConfig);
    const fullscreenWidgetId = useWidgetStore((s) => s.fullscreenWidgetId);
    const setFullscreenWidget = useWidgetStore((s) => s.setFullscreenWidget);

    const [openSettings, setOpenSettings] = useState<boolean>(false);
    const [error, setError] = useState<Error | null>(null);
    const [isHovered, setIsHovered] = useState<boolean>(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const isFullscreen = fullscreenWidgetId === widget.id;
    const widgetMeta = useMemo(
      () => widgetRegistry[widget.type] || ({} as Partial<WidgetMeta>),
      [widget.type],
    );
    const WidgetComponent = widgetMeta.component;

    useEffect(() => {
      setError(null);
    }, [widget.type, widget.id]);

    const handleOpenSettings = useCallback(() => {
      setOpenSettings(true);
    }, []);
    const handleCloseSettings = useCallback(() => {
      setOpenSettings(false);
    }, []);

    const handleConfigChange = useCallback(
      (newConfig: WidgetConfig) => {
        if (!widget.id) return;
        updateWidgetConfig(widget.id, newConfig);
      },
      [updateWidgetConfig, widget.id],
    );

    const handleRetry = useCallback(() => {
      setError(null);
    }, []);
    const handleError = useCallback(
      (err: Error) => {
        console.error(`Error in widget ${widget.type}:`, err);
        setError(err);
      },
      [widget.type],
    );

    const handleDeleteClick = useCallback(() => {
      onDelete(widget.id);
    }, [onDelete, widget.id]);

    const toggleFullscreen = useCallback(() => {
      setFullscreenWidget(isFullscreen ? null : widget.id);
    }, [isFullscreen, widget.id, setFullscreenWidget]);

    // Widget content
    const widgetContent = useMemo(() => {
      if (error) return <ErrorFallback error={error} resetErrorBoundary={handleRetry} />;
      if (!WidgetComponent)
        return (
          <Box sx={{ padding: '20px' }}>
            <Typography>Widget type &apos;{widget.type}&apos; not found</Typography>
          </Box>
        );
      return (
        <Suspense fallback={<WidgetLoader />}>
          <WidgetErrorBoundary onError={handleError} widgetId={widget.id}>
            <Box
              sx={{
                flexGrow: 1,
                minHeight: 0,
                width: '100%',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <WidgetComponent
                config={widget.config || {}}
                commonData={commonData}
                onError={handleError}
              />
            </Box>
          </WidgetErrorBoundary>
        </Suspense>
      );
    }, [
      WidgetComponent,
      error,
      widget.type,
      widget.id,
      widget.config,
      commonData,
      handleRetry,
      handleError,
    ]);

    // Keep controls reachable by touch and keyboard without covering chart inputs.
    const controls = useMemo(
      () => (
        <Fade in timeout={200}>
          <Box
            sx={{
              position: 'relative',
              display: 'flex',
              justifyContent: 'flex-end',
              flexWrap: 'wrap',
              flexShrink: 0,
              p: 0.5,
              bgcolor: 'background.paper',
              borderBottom: '1px solid',
              borderColor: 'divider',
              gap: '4px',
              zIndex: 10,
            }}
          >
            {!readOnly && <AnnotationPanel widgetId={widget.id} />}
            <ExportMenu widgetRef={containerRef} widgetTitle={widgetMeta.title || widget.type} />
            <Tooltip title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              <IconButton
                onClick={toggleFullscreen}
                sx={{
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
                size="small"
                className="no-drag"
              >
                {isFullscreen ? (
                  <FullscreenExitIcon fontSize="small" />
                ) : (
                  <FullscreenIcon fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
            {!readOnly && (
              <>
                <Tooltip title="Widget Settings">
                  <IconButton
                    onClick={handleOpenSettings}
                    sx={{
                      bgcolor: 'background.paper',
                      border: '1px solid',
                      borderColor: 'divider',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                    size="small"
                    className="no-drag"
                  >
                    <SettingsIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Remove Widget">
                  <IconButton
                    onClick={handleDeleteClick}
                    sx={{
                      bgcolor: 'background.paper',
                      border: '1px solid',
                      borderColor: 'divider',
                      '&:hover': { background: 'rgba(200,0,0,0.7)' },
                    }}
                    size="small"
                    className="no-drag"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            )}
          </Box>
        </Fade>
      ),
      [
        readOnly,
        handleOpenSettings,
        handleDeleteClick,
        toggleFullscreen,
        isFullscreen,
        widgetMeta.title,
        widget.type,
        widget.id,
      ],
    );

    const sizeIndicator = useMemo(() => {
      if (!layoutItem || error || isFullscreen) return null;
      return (
        <Fade in={isHovered} timeout={200}>
          <Box
            sx={{
              position: 'absolute',
              bottom: '4px',
              left: '4px',
              fontSize: '10px',
              color: 'text.disabled',
              bgcolor: 'background.paper',
              padding: '2px 6px',
              borderRadius: '4px',
              zIndex: 10,
            }}
          >
            {`${layoutItem.w} x ${layoutItem.h}`}
          </Box>
        </Fade>
      );
    }, [layoutItem, isHovered, error, isFullscreen]);

    // Fullscreen dialog render
    if (isFullscreen) {
      return (
        <>
          <Box sx={{ position: 'relative', height: '100%' }}>
            <Paper
              elevation={3}
              sx={{
                height: '100%',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                opacity: 0.3,
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                }}
              >
                <Typography color="text.disabled">Viewing in fullscreen</Typography>
              </Box>
            </Paper>
          </Box>
          <Dialog
            open={true}
            onClose={toggleFullscreen}
            fullScreen
            PaperProps={{
              sx: { background: (theme) => theme.palette.background.default },
            }}
          >
            <Box
              ref={containerRef}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              sx={{
                height: '100%',
                position: 'relative',
                p: 2,
                display: 'flex',
                flexDirection: 'column',
                bgcolor: 'var(--industrial-field)',
              }}
            >
              {controls}
              {widgetContent}
            </Box>
          </Dialog>
          <SettingsDialog
            open={openSettings}
            onClose={handleCloseSettings}
            widget={widget}
            onConfigChange={handleConfigChange}
          />
        </>
      );
    }

    return (
      <Box
        sx={{ position: 'relative', height: '100%' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        ref={containerRef}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          style={{ height: '100%' }}
        >
          <Paper
            elevation={0}
            sx={{
              height: '100%',
              position: 'relative',
              overflow: 'hidden',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: '7px',
              bgcolor: 'var(--industrial-field)',
              border: '4px solid var(--industrial-well)',
              boxShadow: '0 0 0 1px var(--industrial-edge), inset 0 1px 2px #00000018',
            }}
          >
            {controls}
            {widgetContent}
            {sizeIndicator}
          </Paper>
        </motion.div>

        <SettingsDialog
          open={openSettings}
          onClose={handleCloseSettings}
          widget={widget}
          onConfigChange={handleConfigChange}
        />
      </Box>
    );
  },
);
WidgetContainer.displayName = 'WidgetContainer';

export default WidgetContainer;
