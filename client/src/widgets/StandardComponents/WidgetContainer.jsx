import React, {useState, memo, Suspense, useCallback, useEffect, useRef, useLayoutEffect, useMemo} from 'react';
import {
    Paper,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    Typography,
    Button,
    DialogActions,
    CircularProgress,
    Tooltip,
    Fade,
    Zoom
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SettingsIcon from '@mui/icons-material/Settings';
import ErrorIcon from '@mui/icons-material/Error';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useWidgets } from './WidgetContext';
import { widgetRegistry } from './WidgetRegistry';

// Separate error fallback component
const ErrorFallback = memo(({ error, resetErrorBoundary }) => (
    <div style={{
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        textAlign: 'center'
    }}>
        <ErrorIcon color="error" style={{ fontSize: 48, marginBottom: 16 }} />
        <Typography variant="h6" color="error" gutterBottom>Widget Error</Typography>
        <Typography variant="body2" color="textSecondary" style={{ marginBottom: 16 }}>
            {error.message || "An error occurred while loading this widget"}
        </Typography>
        <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            onClick={resetErrorBoundary}
            size="small"
        >
            Retry
        </Button>
    </div>
));

// Separate loader component
const WidgetLoader = memo(() => (
    <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%'
    }}>
        <CircularProgress size={24} />
    </div>
));

// Custom error boundary for widget content
class WidgetErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        console.error(`Error in widget ${this.props.widgetId}:`, error, info);

        // Call onError callback if provided
        if (typeof this.props.onError === 'function') {
            this.props.onError(error);
        }
    }

    reset = () => {
        this.setState({ hasError: false, error: null });
    }

    render() {
        if (this.state.hasError) {
            return <ErrorFallback
                error={this.state.error}
                resetErrorBoundary={this.reset}
            />;
        }

        return this.props.children;
    }
}

// Settings Dialog component separated for better performance
const SettingsDialog = memo(({ open, onClose, widget, onConfigChange }) => {
    const widgetMeta = widgetRegistry[widget.type] || {};
    const CustomSettingsComponent = widgetMeta.settingsComponent;

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth
            maxWidth="sm"
            className="no-drag"
        >
            <DialogTitle>
                {widgetMeta.title || widget.type} Settings
            </DialogTitle>
            <DialogContent dividers>
                {CustomSettingsComponent ? (
                    <Suspense fallback={<WidgetLoader />}>
                        <CustomSettingsComponent
                            config={widget.config || {}}
                            onConfigChange={onConfigChange}
                        />
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

// Main Widget Container component with performance optimizations
const WidgetContainer = memo(({ widget, onDelete, layoutItem, commonData }) => {
    const { actions } = useWidgets();
    const [openSettings, setOpenSettings] = useState(false);
    const [error, setError] = useState(null);
    const [isHovered, setIsHovered] = useState(false);
    const [mounted, setMounted] = useState(false);
    const containerRef = useRef(null);

    // Memoize these values to prevent unnecessary re-renders
    const widgetMeta = useMemo(() => widgetRegistry[widget.type] || {}, [widget.type]);
    const WidgetComponent = widgetMeta.component;

    // Reset error state when widget type or ID changes
    useEffect(() => {
        setError(null);
    }, [widget.type, widget.id]);

    // Add a mounted effect to ensure the component is fully rendered
    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    // Use layout effect to ensure container size is properly calculated
    useLayoutEffect(() => {
        // Check if we have valid layout and container
        if (!containerRef.current ||
            typeof layoutItem?.w !== 'number' ||
            typeof layoutItem?.h !== 'number') {
            return; // Early return if conditions not met
        }

        // Set initial opacity to 0
        containerRef.current.style.opacity = '0';

        // Safely store the current ref value in case it changes
        const currentRef = containerRef.current;

        // Use timeout to allow layout to complete before showing
        const timeoutId = setTimeout(() => {
            // Check if the ref still exists and hasn't changed
            if (currentRef && currentRef === containerRef.current) {
                currentRef.style.opacity = '1';
            }
        }, 50);

        // Proper cleanup function
        return () => {
            clearTimeout(timeoutId);

            // Ensure we don't leave elements with opacity 0
            if (currentRef && currentRef === containerRef.current) {
                currentRef.style.opacity = '1';
            }
        };
    }, [layoutItem?.w, layoutItem?.h]);

    const handleOpenSettings = useCallback(() => {
        setOpenSettings(true);
    }, []);

    const handleCloseSettings = useCallback(() => {
        setOpenSettings(false);
    }, []);

    const handleConfigChange = useCallback((newConfig) => {
        if (!widget.id) return;
        actions.updateWidgetConfig(widget.id, newConfig);
    }, [actions, widget.id]);

    const handleRetry = useCallback(() => {
        setError(null);
    }, []);

    const handleError = useCallback((err) => {
        console.error(`Error in widget ${widget.type}:`, err);
        setError(err);
    }, [widget.type]);

    // Memoize the widget component rendering
    const widgetContent = useMemo(() => {
        // Ensure widgetComponent exists before rendering
        const hasWidgetComponent = Boolean(WidgetComponent);

        if (error) {
            return <ErrorFallback error={error} resetErrorBoundary={handleRetry} />;
        }

        if (!mounted) {
            return <WidgetLoader />;
        }

        if (!hasWidgetComponent) {
            return (
                <div style={{ padding: '20px' }}>
                    <Typography>Widget type '{widget.type}' not found</Typography>
                </div>
            );
        }

        return (
            <Suspense fallback={<WidgetLoader />}>
                <WidgetErrorBoundary onError={handleError} widgetId={widget.id}>
                    <div style={{ flexGrow: 1, width: '100%', minHeight: '200px', position: 'relative' }}>
                        <WidgetComponent
                            config={widget.config || {}}
                            commonData={commonData}
                            onError={handleError}
                        />
                    </div>
                </WidgetErrorBoundary>
            </Suspense>
        );
    }, [WidgetComponent, error, mounted, widget.type, widget.id, widget.config, commonData, handleRetry, handleError]);

    // Memoize the controls
    const controls = useMemo(() => (
        <Fade in={isHovered || error} timeout={300}>
            <div style={{
                position: 'absolute',
                top: 4,
                right: 4,
                display: 'flex',
                gap: '4px',
                zIndex: 10,
                transition: 'opacity 0.3s ease'
            }}>
                <Tooltip title="Widget Settings">
                    <IconButton
                        onClick={handleOpenSettings}
                        aria-label="settings"
                        sx={{
                            background: 'rgba(131,131,131,0.8)',
                            '&:hover': {
                                background: 'rgba(100,100,100,0.9)',
                            }
                        }}
                        size="small"
                    >
                        <SettingsIcon fontSize="small"/>
                    </IconButton>
                </Tooltip>
                <Tooltip title="Remove Widget">
                    <IconButton
                        onClick={onDelete}
                        aria-label="delete"
                        sx={{
                            background: 'rgba(131,131,131,0.8)',
                            '&:hover': {
                                background: 'rgba(200,0,0,0.7)',
                            }
                        }}
                        size="small"
                    >
                        <DeleteIcon fontSize="small"/>
                    </IconButton>
                </Tooltip>
            </div>
        </Fade>
    ), [isHovered, error, handleOpenSettings, onDelete]);

    // Memoize the size indicator
    const sizeIndicator = useMemo(() => {
        if (!layoutItem || error) return null;

        return (
            <Fade in={isHovered} timeout={300}>
                <div style={{
                    position: 'absolute',
                    bottom: '2px',
                    left: '2px',
                    fontSize: '10px',
                    color: 'white',
                    background: 'rgba(0, 0, 0, 0.5)',
                    padding: '2px 4px',
                    borderRadius: '2px',
                    zIndex: 10,
                }}>
                    {`w: ${layoutItem.w}, h: ${layoutItem.h}`}
                </div>
            </Fade>
        );
    }, [layoutItem, isHovered, error]);

    return (
        <div
            style={{position: 'relative', height: '100%'}}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            ref={containerRef}
        >
            <Zoom in={true} style={{ transitionDelay: '50ms' }}>
                <Paper
                    elevation={3}
                    style={{
                        height: '100%',
                        position: 'relative',
                        overflow: 'hidden',
                        transition: 'box-shadow 0.3s ease',
                        boxShadow: isHovered ? '0px 5px 15px rgba(0,0,0,0.3)' : undefined,
                        display: 'flex',
                        flexDirection: 'column'
                    }}
                >
                    {widgetContent}
                    {controls}
                    {sizeIndicator}
                </Paper>
            </Zoom>

            {/* Settings dialog */}
            <SettingsDialog
                open={openSettings}
                onClose={handleCloseSettings}
                widget={widget}
                onConfigChange={handleConfigChange}
            />
        </div>
    );
});

export default WidgetContainer;