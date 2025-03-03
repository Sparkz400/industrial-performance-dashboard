import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    CircularProgress,
    Box,
    Typography,
    Snackbar,
    Alert,
    Tooltip,
    Backdrop,
    Button, TextField
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import SyncIcon from '@mui/icons-material/Sync';
import { Responsive, WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import { widgetRegistry } from '../widgets/StandardComponents/WidgetRegistry';
import AddWidgetButton from '../components/dashboard/addWidgetButton';
import WidgetPreviewPopup from '../widgets/StandardComponents/WidgetPreviewPopup';
import WidgetContainer from '../widgets/StandardComponents/WidgetContainer';
import { API_ENDPOINTS } from '../config/config';
import { WidgetProvider, useWidgets } from '../widgets/StandardComponents/WidgetContext';
import DashboardTabs from '../components/dashboard/DashboardTabs';

const ResponsiveGridLayout = WidthProvider(Responsive);

// Dashboard reducer to centralize state management
function dashboardReducer(state, action) {
    switch (action.type) {
        case 'SET_DASHBOARDS':
            return {
                ...state,
                dashboards: action.payload,
                initialized: true
            };
        case 'SET_SELECTED_DASHBOARD_ID':
            return {
                ...state,
                selectedDashboardId: action.payload
            };
        case 'SET_EDITING_DASHBOARD_ID':
            return {
                ...state,
                editingDashboardId: action.payload
            };
        case 'SET_LOADING':
            return {
                ...state,
                loading: action.payload
            };
        case 'SET_PREVIEW_OPEN':
            return {
                ...state,
                previewOpen: action.payload
            };
        case 'SET_NOTIFICATION':
            return {
                ...state,
                notification: action.payload
            };
        case 'UPDATE_DASHBOARD_NAME':
            return {
                ...state,
                dashboards: state.dashboards.map(dashboard =>
                    dashboard.id === action.payload.id
                        ? { ...dashboard, name: action.payload.name }
                        : dashboard
                )
            };
        default:
            return state;
    }
}


function DashboardPageInternal() {
    // Use reducer for complex state management
    const [state, dispatch] = React.useReducer(dashboardReducer, {
        dashboards: [],
        selectedDashboardId: null,
        editingDashboardId: null,
        initialized: false,
        previewOpen: false,
        loading: false,
        notification: { open: false, message: '', severity: 'info' }
    });

    const [autoSync, setAutoSync] = useState(false);
    const { state: widgetState, actions } = useWidgets();

    // Refs declared at component level for tracking state between renders
    const isLoading = useRef(false);
    const isSaving = useRef(false);
    const syncTimerId = useRef(null);
    const lastWidgetsLayoutJson = useRef('');
    const hasLocalChanges = useRef(false);
    const lastSavedState = useRef({});
    const prevDashboardsRef = useRef([]);
    const prevWidgetsRef = useRef([]);
    const prevLayoutRef = useRef([]);

    // Helper to show notifications
    const showNotification = useCallback((message, severity = 'info') => {
        dispatch({
            type: 'SET_NOTIFICATION',
            payload: { open: true, message, severity }
        });
    }, []);

    // Close notification handler
    const handleCloseNotification = useCallback(() => {
        dispatch({
            type: 'SET_NOTIFICATION',
            payload: { ...state.notification, open: false }
        });
    }, [state.notification]);

    // Save to local storage with timestamp
    const saveToLocalStorage = useCallback((dashboardsToSave) => {
        if (!dashboardsToSave || dashboardsToSave.length === 0) return;
        try {
            const localData = {
                dashboards: dashboardsToSave,
                lastSaved: new Date().toISOString()
            };
            localStorage.setItem('dashboardData', JSON.stringify(localData));
            hasLocalChanges.current = true;
        } catch (error) {
            console.error('Failed to save to local storage:', error);
        }
    }, []);

    // Save dashboard to server
    const saveDashboardToDB = useCallback(async (dashboard) => {
        if (isSaving.current) {
            return { success: false, message: 'Already saving' };
        }
        isSaving.current = true;
        dispatch({ type: 'SET_LOADING', payload: true });

        try {
            // Create a clean copy to avoid reference issues
            const dashboardToSave = { ...dashboard };
            dashboardToSave.serverLastModified = new Date().toISOString();

            // Ensure widgets and layout are in the correct format
            // Convert to arrays if they're strings, or keep as arrays
            dashboardToSave.widgets = Array.isArray(dashboardToSave.widgets)
                ? dashboardToSave.widgets
                : (typeof dashboardToSave.widgets === 'string'
                    ? JSON.parse(dashboardToSave.widgets || '[]')
                    : []);

            dashboardToSave.layout = Array.isArray(dashboardToSave.layout)
                ? dashboardToSave.layout
                : (typeof dashboardToSave.layout === 'string'
                    ? JSON.parse(dashboardToSave.layout || '[]')
                    : []);

            const response = await fetch(`${API_ENDPOINTS.dashboards}/${dashboard.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dashboardToSave)
            });

            const responseText = await response.text();
            let responseData;

            try {
                // Try to parse as JSON
                responseData = JSON.parse(responseText);
            } catch (e) {
                // If not valid JSON, use the raw text
                console.warn('Server response was not valid JSON:', responseText);
                responseData = { message: responseText };
            }

            if (!response.ok) {
                console.error('Server error response:', response.status, responseData);
                throw new Error(`Server error: ${response.status}`);
            }

            lastSavedState.current[dashboard.id] = {
                timestamp: dashboardToSave.serverLastModified,
                data: dashboardToSave
            };
            hasLocalChanges.current = false;
            return { success: true, data: responseData };
        } catch (error) {
            console.error('Error saving dashboard:', error);
            return { success: false, message: error.message };
        } finally {
            // Use setTimeout to avoid state update conflicts
            setTimeout(() => {
                isSaving.current = false;
                dispatch({ type: 'SET_LOADING', payload: false });
            }, 1000);
        }
    }, []);

    // Persist dashboard state
    const persistDashboardState = useCallback(async (dashboard) => {
        dispatch({ type: 'SET_LOADING', payload: true });

        try {
            saveToLocalStorage([...state.dashboards]);
            const result = await saveDashboardToDB(dashboard);

            if (result.success) {
                showNotification('Dashboard saved successfully', 'success');
                return true;
            } else {
                showNotification('Saved locally. Server save failed.', 'warning');
                return false;
            }
        } catch (error) {
            showNotification('Error saving. Changes saved locally.', 'error');
            return false;
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    }, [state.dashboards, saveDashboardToDB, saveToLocalStorage, showNotification]);

    // Add a new dashboard
    const handleAddDashboard = useCallback(async () => {
        dispatch({ type: 'SET_LOADING', payload: true });

        const timestamp = new Date().toISOString();
        const newDashboard = {
            id: 'dashboard-' + Date.now(),
            name: 'New Dashboard',
            widgets: [],
            layout: [],
            localLastModified: timestamp
        };

        // Update dashboards array
        const updatedDashboards = [...state.dashboards, newDashboard];
        dispatch({ type: 'SET_DASHBOARDS', payload: updatedDashboards });
        dispatch({ type: 'SET_SELECTED_DASHBOARD_ID', payload: newDashboard.id });

        // Reset widget state
        actions.setWidgets([]);
        actions.setLayout([]);

        // Save to local storage
        saveToLocalStorage(updatedDashboards);

        try {
            await persistDashboardState(newDashboard);
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
            showNotification('New dashboard created', 'success');
        }
    }, [state.dashboards, actions, persistDashboardState, saveToLocalStorage, showNotification]);

    // Delete a dashboard
    const handleDeleteDashboard = useCallback(async (dashboardId) => {
        dispatch({ type: 'SET_LOADING', payload: true });

        const newDashboards = state.dashboards.filter(d => d.id !== dashboardId);
        dispatch({ type: 'SET_DASHBOARDS', payload: newDashboards });
        saveToLocalStorage(newDashboards);

        if (state.selectedDashboardId === dashboardId) {
            if (newDashboards.length > 0) {
                const firstDashboard = newDashboards[0];
                dispatch({ type: 'SET_SELECTED_DASHBOARD_ID', payload: firstDashboard.id });
                actions.setWidgets(firstDashboard.widgets || []);
                actions.setLayout(firstDashboard.layout || []);
            } else {
                handleAddDashboard();
            }
        }

        try {
            await fetch(`${API_ENDPOINTS.dashboards}/${dashboardId}`, { method: 'DELETE' });
            showNotification('Dashboard deleted', 'success');
        } catch (error) {
            console.error('Error deleting dashboard from server:', error);
            showNotification('Deleted locally. Server delete failed.', 'warning');
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    }, [state.dashboards, state.selectedDashboardId, actions, handleAddDashboard, saveToLocalStorage, showNotification]);

    // Select a dashboard and save the current one first
    const handleSelectDashboard = useCallback((event, newIndex) => {
        if (newIndex < 0 || newIndex >= state.dashboards.length) return;

        // Save current dashboard state first
        const currentDashboard = state.dashboards.find(d => d.id === state.selectedDashboardId);
        if (currentDashboard) {
            const updatedDashboards = state.dashboards.map(d =>
                d.id === state.selectedDashboardId
                    ? { ...d, widgets: widgetState.widgets, layout: widgetState.layout, localLastModified: new Date().toISOString() }
                    : d
            );
            dispatch({ type: 'SET_DASHBOARDS', payload: updatedDashboards });
            saveToLocalStorage(updatedDashboards);
        }

        // Select the new dashboard
        const selectedDashboard = state.dashboards[newIndex];
        if (selectedDashboard) {
            dispatch({ type: 'SET_SELECTED_DASHBOARD_ID', payload: selectedDashboard.id });
            actions.setWidgets(selectedDashboard.widgets || []);
            actions.setLayout(selectedDashboard.layout || []);
        }
    }, [state.dashboards, state.selectedDashboardId, widgetState.widgets, widgetState.layout, actions, saveToLocalStorage]);

    // Rename a dashboard
    const handleRenameDashboard = useCallback((dashboardId, newName) => {
        // Handle null/undefined (cancellation)
        if (newName === null || newName === undefined) {
            dispatch({ type: 'SET_EDITING_DASHBOARD_ID', payload: null });
            return;
        }

        // Validate newName - don't allow empty or only whitespace
        if (!newName || newName.trim() === '') {
            dispatch({ type: 'SET_EDITING_DASHBOARD_ID', payload: null });
            showNotification('Dashboard name cannot be empty', 'error');
            return;
        }

        const timestamp = new Date().toISOString();
        const trimmedName = newName.trim();

        // Update dashboard name in state
        dispatch({
            type: 'UPDATE_DASHBOARD_NAME',
            payload: { id: dashboardId, name: trimmedName }
        });

        // Get updated dashboards after name change
        const updatedDashboards = state.dashboards.map(d =>
            d.id === dashboardId
                ? { ...d, name: trimmedName, localLastModified: timestamp }
                : d
        );

        // Save to localStorage
        saveToLocalStorage(updatedDashboards);

        // Update the editing state
        dispatch({ type: 'SET_EDITING_DASHBOARD_ID', payload: null });

        // Find the dashboard to update on server
        const dashboard = state.dashboards.find(d => d.id === dashboardId);
        if (dashboard) {
            const dashboardToSave = {
                ...dashboard,
                name: trimmedName,
                widgets: dashboardId === state.selectedDashboardId ? widgetState.widgets : dashboard.widgets,
                layout: dashboardId === state.selectedDashboardId ? widgetState.layout : dashboard.layout,
                localLastModified: timestamp
            };

            // Use wrapper function to handle errors cleanly
            (async () => {
                try {
                    const result = await persistDashboardState(dashboardToSave);
                    if (result) {
                        showNotification(`Dashboard renamed to "${trimmedName}"`, 'success');
                    }
                } catch (error) {
                    console.error('Error saving renamed dashboard:', error);
                    // Already showing notification in persistDashboardState
                }
            })();
        }
    }, [state.dashboards, state.selectedDashboardId, widgetState.widgets, widgetState.layout, persistDashboardState, saveToLocalStorage, showNotification, dispatch]);

    // Add widget to the current dashboard
    const handleAddWidget = useCallback((widgetType) => {
        dispatch({ type: 'SET_LOADING', payload: true });

        try {
            const widgetMeta = widgetRegistry[widgetType];
            if (!widgetMeta) {
                throw new Error(`Widget type '${widgetType}' not found in registry`);
            }

            const widgetId = actions.addWidget(widgetType, widgetMeta);

            // Use setTimeout to avoid state conflicts
            setTimeout(() => {
                const currentDashboard = state.dashboards.find(d => d.id === state.selectedDashboardId);
                if (currentDashboard) {
                    const updatedDashboards = state.dashboards.map(d =>
                        d.id === state.selectedDashboardId
                            ? { ...d, widgets: widgetState.widgets, layout: widgetState.layout, localLastModified: new Date().toISOString() }
                            : d
                    );
                    dispatch({ type: 'SET_DASHBOARDS', payload: updatedDashboards });
                    saveToLocalStorage(updatedDashboards);
                }
                dispatch({ type: 'SET_LOADING', payload: false });
                showNotification(`Added ${widgetMeta.title || widgetType} widget`, 'success');
            }, 0);

            return widgetId;
        } catch (error) {
            console.error('Error adding widget:', error);
            dispatch({ type: 'SET_LOADING', payload: false });
            showNotification(`Failed to add widget: ${error.message}`, 'error');
            return null;
        }
    }, [actions, state.dashboards, state.selectedDashboardId, widgetState.widgets, widgetState.layout, saveToLocalStorage, showNotification]);

    // Remove widget from dashboard
    const handleRemoveWidget = useCallback((widgetId) => {
        dispatch({ type: 'SET_LOADING', payload: true });

        try {
            actions.removeWidget(widgetId);

            // Update dashboards after widget removal (using setTimeout to avoid state conflicts)
            setTimeout(() => {
                const updatedDashboards = state.dashboards.map(d =>
                    d.id === state.selectedDashboardId
                        ? { ...d, widgets: widgetState.widgets, layout: widgetState.layout, localLastModified: new Date().toISOString() }
                        : d
                );
                dispatch({ type: 'SET_DASHBOARDS', payload: updatedDashboards });
                saveToLocalStorage(updatedDashboards);
                dispatch({ type: 'SET_LOADING', payload: false });
                showNotification('Widget removed', 'info');
            }, 0);
        } catch (error) {
            console.error('Error removing widget:', error);
            dispatch({ type: 'SET_LOADING', payload: false });
            showNotification(`Failed to remove widget: ${error.message}`, 'error');
        }
    }, [actions, state.dashboards, state.selectedDashboardId, widgetState.widgets, widgetState.layout, saveToLocalStorage, showNotification]);

    // Manual save dashboard
    const saveDashboard = useCallback(() => {
        const currentDashboard = state.dashboards.find(d => d.id === state.selectedDashboardId);
        if (!currentDashboard) {
            showNotification('No dashboard selected', 'error');
            return;
        }

        dispatch({ type: 'SET_LOADING', payload: true });

        const updatedDashboard = {
            ...currentDashboard,
            widgets: widgetState.widgets,
            layout: widgetState.layout,
            localLastModified: new Date().toISOString()
        };

        const updatedDashboards = state.dashboards.map(d =>
            d.id === state.selectedDashboardId ? updatedDashboard : d
        );

        dispatch({ type: 'SET_DASHBOARDS', payload: updatedDashboards });
        saveToLocalStorage(updatedDashboards);

        persistDashboardState(updatedDashboard)
            .finally(() => dispatch({ type: 'SET_LOADING', payload: false }));
    }, [state.dashboards, state.selectedDashboardId, widgetState.widgets, widgetState.layout, persistDashboardState, saveToLocalStorage, showNotification]);

    // Manual sync with server
    const syncWithServer = useCallback(async () => {
        dispatch({ type: 'SET_LOADING', payload: true });

        try {
            if (state.selectedDashboardId) {
                const currentDashboard = state.dashboards.find(d => d.id === state.selectedDashboardId);
                if (currentDashboard) {
                    const updatedDashboard = {
                        ...currentDashboard,
                        widgets: widgetState.widgets,
                        layout: widgetState.layout,
                        localLastModified: new Date().toISOString()
                    };
                    await saveDashboardToDB(updatedDashboard);
                }
            }
            showNotification('Changes saved to server', 'success');
            hasLocalChanges.current = false;
        } catch (error) {
            console.error('Error syncing with server:', error);
            showNotification('Error syncing with server', 'error');
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    }, [state.dashboards, state.selectedDashboardId, widgetState.widgets, widgetState.layout, saveDashboardToDB, showNotification]);

    // Create a default dashboard
    const createDefaultDashboardInternal = useCallback(() => {
        const timestamp = new Date().toISOString();
        const defaultDashboard = {
            id: 'dashboard-' + Date.now(),
            name: 'My Dashboard',
            widgets: [],
            layout: [],
            localLastModified: timestamp
        };

        dispatch({ type: 'SET_DASHBOARDS', payload: [defaultDashboard] });
        dispatch({ type: 'SET_SELECTED_DASHBOARD_ID', payload: defaultDashboard.id });

        actions.setWidgets([]);
        actions.setLayout([]);

        try {
            // Inline the saveToLocalStorage logic
            const localData = {
                dashboards: [defaultDashboard],
                lastSaved: timestamp
            };
            localStorage.setItem('dashboardData', JSON.stringify(localData));
            hasLocalChanges.current = true;

            // Save to server in background
            (async () => {
                try {
                    const response = await fetch(`${API_ENDPOINTS.dashboards}/${defaultDashboard.id}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(defaultDashboard)
                    });

                    if (response.ok) {
                        dispatch({
                            type: 'SET_NOTIFICATION',
                            payload: {
                                open: true,
                                message: 'Dashboard created successfully',
                                severity: 'success'
                            }
                        });
                    }
                } catch (error) {
                    console.error("Error saving new dashboard to server:", error);
                    dispatch({
                        type: 'SET_NOTIFICATION',
                        payload: {
                            open: true,
                            message: 'Dashboard created and saved locally',
                            severity: 'info'
                        }
                    });
                }
            })();
        } catch (error) {
            console.error('Failed to initialize dashboard:', error);
            dispatch({
                type: 'SET_NOTIFICATION',
                payload: {
                    open: true,
                    message: 'Error creating dashboard',
                    severity: 'error'
                }
            });
        }
    }, [dispatch, actions, API_ENDPOINTS]);

    // Load dashboards on init
    useEffect(() => {
        // Flag to prevent state updates after unmount
        let isMounted = true;

        async function loadDashboards() {
            if (isLoading.current) return;
            isLoading.current = true;

            if (isMounted) {
                dispatch({ type: "SET_LOADING", payload: true });
            }

            let localDashboards = [];
            try {
                // First try to load from localStorage
                const localDataStr = localStorage.getItem('dashboardData');
                if (localDataStr) {
                    const localData = JSON.parse(localDataStr);
                    localDashboards = localData.dashboards || [];

                    if (localDashboards.length > 0 && isMounted) {
                        const firstDashboard = localDashboards[0];

                        // Update state with loaded dashboards
                        dispatch({ type: "SET_DASHBOARDS", payload: localDashboards });
                        dispatch({ type: "SET_SELECTED_DASHBOARD_ID", payload: firstDashboard.id });

                        // Update widget state
                        actions.setWidgets(firstDashboard.widgets || []);
                        actions.setLayout(firstDashboard.layout || []);
                    } else {
                        // No dashboards in localStorage, try server
                        await fetchFromServerOrCreateDefault();
                    }
                } else {
                    // Nothing in localStorage, try server
                    await fetchFromServerOrCreateDefault();
                }
            } catch (error) {
                console.error('Error loading from local storage:', error);
                if (isMounted) {
                    createDefaultDashboardInternal();
                }
            } finally {
                if (isMounted) {
                    dispatch({ type: "SET_LOADING", payload: false });
                }
                isLoading.current = false;
            }
        }

        async function fetchFromServerOrCreateDefault() {
            if (!isMounted) return;

            try {
                const res = await fetch(API_ENDPOINTS.dashboards);

                if (!isMounted) return;

                if (!res.ok) {
                    throw new Error(`Server responded with status: ${res.status}`);
                }

                const serverDashboards = await res.json();

                if (!isMounted) return;

                if (serverDashboards && serverDashboards.length > 0) {
                    dispatch({ type: "SET_DASHBOARDS", payload: serverDashboards });
                    const firstDashboard = serverDashboards[0];
                    dispatch({ type: "SET_SELECTED_DASHBOARD_ID", payload: firstDashboard.id });
                    actions.setWidgets(firstDashboard.widgets || []);
                    actions.setLayout(firstDashboard.layout || []);
                } else {
                    // Empty array from server, create default
                    console.warn('No dashboards returned from server, creating default');
                    createDefaultDashboardInternal();
                }
            } catch (error) {
                console.error('Error fetching from server:', error);
                if (isMounted) {
                    createDefaultDashboardInternal();
                }
            }
        }

        // Start loading dashboards
        void loadDashboards();

        // Cleanup function
        return () => {
            isMounted = false;
        };
    }, [dispatch, actions, createDefaultDashboardInternal, API_ENDPOINTS]);

    // Initialize selected dashboard if not set but dashboards are loaded
    useEffect(() => {
        if (state.initialized && state.dashboards.length > 0 && !state.selectedDashboardId) {
            const firstDashboard = state.dashboards[0];
            dispatch({ type: 'SET_SELECTED_DASHBOARD_ID', payload: firstDashboard.id });
            actions.setWidgets(firstDashboard.widgets || []);
            actions.setLayout(firstDashboard.layout || []);
        }
    }, [state.initialized, state.dashboards, state.selectedDashboardId, actions]);

    // Update local storage when layout changes - with debouncing to prevent excessive saves
    useEffect(() => {
        if (!state.initialized || !state.selectedDashboardId) return;

        // Debounce local storage updates to avoid excessive writes
        const currentJson = JSON.stringify({ widgets: widgetState.widgets, layout: widgetState.layout });
        if (currentJson === lastWidgetsLayoutJson.current) return;

        lastWidgetsLayoutJson.current = currentJson;

        // Use a debounce timer to batch updates
        const timerId = setTimeout(() => {
            try {
                const storedData = localStorage.getItem('dashboardData');
                const parsedData = storedData ? JSON.parse(storedData) : { dashboards: [] };

                const updatedDashboards = parsedData.dashboards.map(dashboard =>
                    dashboard.id === state.selectedDashboardId
                        ? { ...dashboard, widgets: widgetState.widgets, layout: widgetState.layout, localLastModified: new Date().toISOString() }
                        : dashboard
                );

                localStorage.setItem('dashboardData', JSON.stringify({
                    dashboards: updatedDashboards,
                    lastSaved: new Date().toISOString()
                }));

                hasLocalChanges.current = true;
            } catch (error) {
                console.error('Failed to save to local storage:', error);
            }
        }, 500); // 500ms debounce

        // Clean up timer on next effect run
        return () => clearTimeout(timerId);
    }, [state.initialized, state.selectedDashboardId, widgetState.widgets, widgetState.layout]);

    // Auto-sync effect (if enabled) - with proper cleanup
    useEffect(() => {
        // Only set up timer if needed
        if (!autoSync || !state.initialized) return;

        // Use a local variable to track state for the closure
        let isActive = true;

        const timerFn = () => {
            // Check if component is still mounted and conditions are met
            if (isActive && hasLocalChanges.current && !isSaving.current && !isLoading.current) {
                syncWithServer().catch(err => {
                    console.error("Auto-sync error:", err);
                });
            }
        };

        // Set up the interval
        syncTimerId.current = setInterval(timerFn, 300000); // 5 minutes

        // Proper cleanup
        return () => {
            isActive = false;
            if (syncTimerId.current) {
                clearInterval(syncTimerId.current);
                syncTimerId.current = null;
            }
        };
    }, [autoSync, state.initialized, syncWithServer]);

    // Synchronize current widget/layout state into the selected dashboard
    useEffect(() => {
        // Early return if not initialized or no dashboard selected
        if (!state.initialized || !state.selectedDashboardId) return;

        // Store values at time of effect creation to avoid stale closure issues
        const currentWidgets = widgetState.widgets;
        const currentLayout = widgetState.layout;
        const selectedDashboardId = state.selectedDashboardId;
        const dashboards = state.dashboards;

        // Prevent stringifying on every render - only when effect runs
        const currentWidgetsStr = JSON.stringify(currentWidgets);
        const prevWidgetsStr = JSON.stringify(prevWidgetsRef.current);
        const currentLayoutStr = JSON.stringify(currentLayout);
        const prevLayoutStr = JSON.stringify(prevLayoutRef.current);

        // Skip if nothing changed to prevent infinite loops
        if (currentWidgetsStr === prevWidgetsStr && currentLayoutStr === prevLayoutStr) {
            return;
        }

        // Update refs with current values for next comparison
        prevWidgetsRef.current = currentWidgets;
        prevLayoutRef.current = currentLayout;

        // Use a debounce timer to batch updates
        const timeoutId = setTimeout(() => {
            // Find the dashboard we need to update
            const dashboardToUpdate = dashboards.find(d => d.id === selectedDashboardId);
            if (!dashboardToUpdate) return;

            // Check if actual content changed to avoid unnecessary updates
            const dashboardWidgetsStr = JSON.stringify(dashboardToUpdate.widgets);
            const dashboardLayoutStr = JSON.stringify(dashboardToUpdate.layout);

            if (dashboardWidgetsStr !== currentWidgetsStr || dashboardLayoutStr !== currentLayoutStr) {
                // Create new dashboards array with updated dashboard
                const updatedDashboards = dashboards.map(d =>
                    d.id === selectedDashboardId
                        ? {
                            ...d,
                            widgets: currentWidgets,
                            layout: currentLayout,
                            localLastModified: new Date().toISOString()
                        }
                        : d
                );

                // Only dispatch if dashboards array actually changed
                const prevDashboardsStr = JSON.stringify(prevDashboardsRef.current);
                const updatedDashboardsStr = JSON.stringify(updatedDashboards);

                if (updatedDashboardsStr !== prevDashboardsStr) {
                    prevDashboardsRef.current = updatedDashboards;
                    dispatch({ type: 'SET_DASHBOARDS', payload: updatedDashboards });
                }
            }
        }, 300); // 300ms debounce

        return () => clearTimeout(timeoutId);
    }, [
        state.initialized,
        state.selectedDashboardId,
        state.dashboards,
        widgetState.widgets,
        widgetState.layout,
        dispatch
    ]);

    // Loading state fallback
    if (!state.initialized) {
        return (
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100vh'
                }}
            >
                <CircularProgress color="secondary" sx={{ mb: 3 }} />
                <Typography variant="h6" color="textSecondary">
                    Loading Dashboards...
                </Typography>
            </Box>
        );
    }

    const selectedIndex = state.dashboards.findIndex(d => d.id === state.selectedDashboardId);

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Dashboard Tabs Header */}
            <Box sx={{
                borderBottom: 1,
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                px: 2,
                backgroundColor: 'rgba(0,0,0,0.05)'
            }}>
                <DashboardTabs
                    dashboards={state.dashboards}
                    selectedIndex={selectedIndex}
                    onSelectDashboard={handleSelectDashboard}
                    onEditName={(id, name) => {

                        if (name === null) {
                            // Just exit edit mode without saving
                            dispatch({ type: 'SET_EDITING_DASHBOARD_ID', payload: null });
                        } else if (name !== undefined) {
                            // A name is provided, save it
                            handleRenameDashboard(id, name);
                        } else {
                            // No name provided, enter edit mode
                            dispatch({ type: 'SET_EDITING_DASHBOARD_ID', payload: id });
                        }
                    }}
                    onDeleteDashboard={(id) => {
                        if (window.confirm(`Are you sure you want to delete "${state.dashboards.find(d => d.id === id)?.name}"?`)) {
                            void handleDeleteDashboard(id);
                        }
                    }}
                    editingDashboardId={state.editingDashboardId}
                    loading={state.loading}
                />

                <Box sx={{ display: 'flex', alignItems: 'center', ml: 1 }}>
                    <Tooltip title="Save Dashboard">
            <span>
                <Button
                    variant="contained"
                    color="primary"
                    onClick={saveDashboard}
                    disabled={state.loading}
                    sx={{ mr: 1 }}
                    startIcon={state.loading ? <CircularProgress size={20} /> : <SaveIcon />}
                >
                    Save
                </Button>
            </span>
                    </Tooltip>
                    <Tooltip title="Sync with Server">
            <span>
                <Button
                    variant="outlined"
                    color="primary"
                    onClick={syncWithServer}
                    disabled={state.loading}
                    sx={{ mr: 1 }}
                    startIcon={state.loading ? <CircularProgress size={20} /> : <SyncIcon />}
                >
                    Sync
                </Button>
            </span>
                    </Tooltip>
                    <Tooltip title="Add New Dashboard">
            <span>
                <Button
                    variant="outlined"
                    color="secondary"
                    onClick={handleAddDashboard}
                    disabled={state.loading}
                    startIcon={state.loading ? <CircularProgress size={20} /> : <AddIcon />}
                >
                    New
                </Button>
            </span>
                    </Tooltip>
                </Box>
            </Box>

            {/* Grid Layout with Widgets */}
            <Box sx={{ flexGrow: 1, p: 2, overflow: 'auto', position: 'relative' }}>
                <ResponsiveGridLayout
                    draggableCancel=".MuiIconButton-root, .no-drag"
                    className="layout"
                    layouts={{ lg: widgetState.layout, md: widgetState.layout, sm: widgetState.layout, xs: widgetState.layout, xxs: widgetState.layout }}
                    breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                    cols={{ lg: 12, md: 12, sm: 12, xs: 12, xxs: 12 }}
                    rowHeight={35}
                    onLayoutChange={(currentLayout) => {
                        actions.updateLayout(currentLayout);
                        hasLocalChanges.current = true;
                    }}
                    margin={[16, 16]}
                    containerPadding={[0, 0]}
                >
                    {widgetState.widgets.map(widget => {
                        const layoutItem = widgetState.layout.find(item => item.i === widget.id);
                        return (
                            <div key={widget.id}>
                                <WidgetContainer
                                    widget={widget}
                                    onDelete={() => handleRemoveWidget(widget.id)}
                                    layoutItem={layoutItem}
                                    commonData={{ dashboardId: state.selectedDashboardId }}
                                />
                            </div>
                        );
                    })}
                </ResponsiveGridLayout>
            </Box>

            {/* Add Widget Button & Preview Dialog */}
            <AddWidgetButton onClick={() => dispatch({ type: 'SET_PREVIEW_OPEN', payload: true })} />
            <WidgetPreviewPopup
                open={state.previewOpen}
                onClose={() => dispatch({ type: 'SET_PREVIEW_OPEN', payload: false })}
                onSelect={handleAddWidget}
            />

            {/* Loading Backdrop */}
            <Backdrop
                sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}
                open={state.loading}
            >
                <CircularProgress color="inherit" />
            </Backdrop>

            {/* Notifications */}
            <Snackbar
                open={state.notification.open}
                autoHideDuration={4000}
                onClose={handleCloseNotification}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert
                    onClose={handleCloseNotification}
                    severity={state.notification.severity}
                    variant="filled"
                    sx={{ width: '100%' }}
                >
                    {state.notification.message}
                </Alert>
            </Snackbar>

            {/* Unsaved Changes Indicator */}
            {hasLocalChanges.current && (
                <Box
                    sx={{
                        position: 'fixed',
                        bottom: 20,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        bgcolor: 'background.paper',
                        boxShadow: 3,
                        borderRadius: 2,
                        p: 1,
                        display: 'flex',
                        alignItems: 'center',
                        zIndex: 1000
                    }}
                >
                    <Typography variant="body2" sx={{ mr: 2 }}>
                        You have unsaved changes
                    </Typography>
                    <Button
                        variant="contained"
                        size="small"
                        onClick={syncWithServer}
                        disabled={state.loading}
                    >
                        {state.loading ? 'Saving...' : 'Save Changes'}
                    </Button>
                </Box>
            )}
        </Box>
    );
}

function DashboardPage() {
    return (
        <WidgetProvider>
            <DashboardPageInternal />
        </WidgetProvider>
    );
}

export default DashboardPage;