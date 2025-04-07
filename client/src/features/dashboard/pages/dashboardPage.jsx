// ===== ..\client\src\features\dashboard\pages\dashboardPage.jsx =====
import React, { useState, useEffect, useCallback, useRef, useReducer, useMemo } from 'react';
import {
    CircularProgress,
    Box,
    Typography,
    Tooltip,
    Dialog,           // Import Dialog components
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Button
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import { Responsive, WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useSnackbar } from 'notistack';

import { API_ENDPOINTS } from '../../../config/config.js';
import {
    widgetRegistry,
    WidgetContainer,
    WidgetProvider,
    useWidgets,
    WidgetPreviewPopup
} from '../../widgets/index';
import api from '../../../utils/api.js';

// Feature imports
import DashboardTabs from '../components/DashboardTabs.jsx';
import AddWidgetButton from '../components/addWidgetButton.jsx';
import { ButtonLoader, LoadingOverlay } from '../../../shared/components/loading/index.js';

const ResponsiveGridLayout = WidthProvider(Responsive);

// --- Action Types ---
const ActionTypes = {
    INITIAL_LOAD_START: 'INITIAL_LOAD_START',
    INITIAL_LOAD_SUCCESS: 'INITIAL_LOAD_SUCCESS',
    INITIAL_LOAD_FAIL: 'INITIAL_LOAD_FAIL',
    SET_SELECTED_DASHBOARD_ID: 'SET_SELECTED_DASHBOARD_ID',
    SET_EDITING_DASHBOARD_ID: 'SET_EDITING_DASHBOARD_ID',
    SET_PREVIEW_OPEN: 'SET_PREVIEW_OPEN',
    SET_CONFIRM_DELETE_OPEN: 'SET_CONFIRM_DELETE_OPEN',
    SET_DASHBOARD_TO_DELETE: 'SET_DASHBOARD_TO_DELETE',

    // Dashboard CRUD & Updates
    SET_DASHBOARDS: 'SET_DASHBOARDS', // Replace all dashboards
    ADD_DASHBOARD_SUCCESS: 'ADD_DASHBOARD_SUCCESS',
    DELETE_DASHBOARD_SUCCESS: 'DELETE_DASHBOARD_SUCCESS',
    RENAME_DASHBOARD_SUCCESS: 'RENAME_DASHBOARD_SUCCESS',
    UPDATE_DASHBOARD_CONTENT: 'UPDATE_DASHBOARD_CONTENT',

    // Loading/Saving States
    START_LOADING: 'START_LOADING',
    STOP_LOADING: 'STOP_LOADING',
    START_SAVING: 'START_SAVING',
    STOP_SAVING: 'STOP_SAVING',
    SET_HAS_LOCAL_CHANGES: 'SET_HAS_LOCAL_CHANGES',
    SET_SERVER_SYNC_STATUS: 'SET_SERVER_SYNC_STATUS',
};

// --- Dashboard Reducer ---
function dashboardReducer(state, action) {
    switch (action.type) {
        case ActionTypes.INITIAL_LOAD_START:
            return { ...state, isLoading: true, initialized: false };
        case ActionTypes.INITIAL_LOAD_SUCCESS:
            return {
                ...state,
                isLoading: false,
                initialized: true,
                dashboards: action.payload.dashboards,
                selectedDashboardId: action.payload.selectedDashboardId,
                hasLocalChanges: action.payload.hasLocalChanges
            };
        case ActionTypes.INITIAL_LOAD_FAIL:
            return {
                ...state,
                isLoading: false,
                initialized: true,
            };
        case ActionTypes.SET_DASHBOARDS:
            return {
                ...state,
                dashboards: action.payload,
                // Optionally mark as changed if this action implies it
                hasLocalChanges: true
            };
        case ActionTypes.ADD_DASHBOARD_SUCCESS:
            return {
                ...state,
                isLoading: false,
                isSaving: false,
                dashboards: [...state.dashboards, action.payload.newDashboard],
                selectedDashboardId: action.payload.newDashboard.id,
                hasLocalChanges: true, // New dashboard needs saving
            };
        case ActionTypes.DELETE_DASHBOARD_SUCCESS:
            return {
                ...state,
                isLoading: false,
                isSaving: false,
                dashboards: action.payload.newDashboards,
                selectedDashboardId: action.payload.newSelectedId, // May be null if last one deleted
                hasLocalChanges: true, // Deletion is a change
            };
        case ActionTypes.RENAME_DASHBOARD_SUCCESS:
            return {
                ...state,
                isLoading: false,
                isSaving: false,
                editingDashboardId: null,
                dashboards: state.dashboards.map(d =>
                    d.id === action.payload.id ? { ...d, name: action.payload.name, localLastModified: new Date().toISOString() } : d
                ),
                hasLocalChanges: true,
                serverSyncStatus: 'idle', // Reset sync status after successful save
            };
        case ActionTypes.UPDATE_DASHBOARD_CONTENT: // Update widgets/layout from context
            return {
                ...state,
                dashboards: state.dashboards.map(dashboard =>
                    dashboard.id === action.payload.dashboardId
                        ? {
                            ...dashboard,
                            widgets: action.payload.widgets,
                            layout: action.payload.layout,
                            localLastModified: new Date().toISOString() // Mark modification time
                        }
                        : dashboard
                ),
                hasLocalChanges: true // Content change always marks local changes
            };
        case ActionTypes.SET_SELECTED_DASHBOARD_ID:
            // Note: Logic to save previous dashboard's state needs to happen *before* dispatching this
            return {
                ...state,
                selectedDashboardId: action.payload
            };
        case ActionTypes.SET_EDITING_DASHBOARD_ID:
            return {
                ...state,
                editingDashboardId: action.payload
            };
        case ActionTypes.SET_PREVIEW_OPEN:
            return {
                ...state,
                previewOpen: action.payload
            };
        case ActionTypes.SET_CONFIRM_DELETE_OPEN:
            return {
                ...state,
                confirmDeleteDialogOpen: action.payload
            };
        case ActionTypes.SET_DASHBOARD_TO_DELETE:
            return {
                ...state,
                dashboardToDeleteId: action.payload
            };
        case ActionTypes.START_LOADING:
            return { ...state, isLoading: true };
        case ActionTypes.STOP_LOADING:
            return { ...state, isLoading: false };
        case ActionTypes.START_SAVING:
            return { ...state, isSaving: true, serverSyncStatus: 'syncing' };
        case ActionTypes.STOP_SAVING:
            // Only stop saving indicator; sync status is set by success/fail actions
            return { ...state, isSaving: false };
        case ActionTypes.SET_HAS_LOCAL_CHANGES:
            return { ...state, hasLocalChanges: action.payload };
        case ActionTypes.SET_SERVER_SYNC_STATUS:
            const newState = { ...state, serverSyncStatus: action.payload.status };
            if (action.payload.status === 'success') {
                newState.hasLocalChanges = false;
            } else if (action.payload.status === 'error') {

            } else if (action.payload.status === 'warning') {

            }
            // Update dashboard data if provided (from previous step)
            if (action.payload.status === 'success' && action.payload.data && action.payload.data.id) {
                newState.dashboards = state.dashboards.map(d =>
                    d.id === action.payload.data.id ? { ...action.payload.data } : d
                );
            }
            return newState;
        default:
            return state;
    }
}

// --- Debounce Hook ---
function useDebounce(value, delay) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
}

// --- Dashboard Component ---
function DashboardPageInternal() {
    // Reducer for managing dashboard state
    const [state, dispatch] = useReducer(dashboardReducer, {
        dashboards: [],
        selectedDashboardId: null,
        editingDashboardId: null,
        initialized: false,
        previewOpen: false,
        isLoading: false,
        isSaving: false,
        hasLocalChanges: false,
        serverSyncStatus: 'idle',
        confirmDeleteDialogOpen: false, // State for delete confirmation dialog
        dashboardToDeleteId: null,     // ID of dashboard pending deletion
    });

    const [autoSync, setAutoSync] = useState(false);
    const { state: widgetState, actions: widgetActions } = useWidgets();
    const { enqueueSnackbar } = useSnackbar();

    const syncTimerId = useRef(null);
    const isComponentMounted = useRef(true);

    // --- Callbacks ---

    // Save combined dashboard data to local storage
    const saveAllToLocalStorage = useCallback((dashboardsToSave) => {
        if (!isComponentMounted.current) return;
        try {
            const localData = {
                dashboards: dashboardsToSave,
                lastSavedLocal: new Date().toISOString() // Distinguish from server save time
            };
            localStorage.setItem('dashboardData', JSON.stringify(localData));
            // Setting hasLocalChanges is handled by the actions that modify dashboards
        } catch (error) {
            console.error('Failed to save to local storage:', error);
            enqueueSnackbar('Error saving data locally', { variant: 'error' });
        }
    }, [enqueueSnackbar]);

    // Save a single dashboard to the server
    const saveDashboardToServer = useCallback(async (dashboard) => {
        if (!dashboard || !dashboard.id) {
            enqueueSnackbar('Cannot save: Invalid dashboard data', { variant: 'error' });
            return { success: false, message: 'Invalid dashboard data' };
        }
        dispatch({ type: ActionTypes.START_SAVING });

        try {
            // Ensure widgets/layout are arrays before stringifying for the API call
            const dashboardToSave = {
                ...dashboard,
                widgets: Array.isArray(dashboard.widgets) ? dashboard.widgets : [],
                layout: Array.isArray(dashboard.layout) ? dashboard.layout : [],
                serverLastModified: new Date().toISOString() // Add server timestamp
            };

            // Use the API utility
            const responseData = await api.endpoints.saveDashboard(dashboardToSave);

            // Dispatch success action with the returned data
            dispatch({
                type: ActionTypes.SET_SERVER_SYNC_STATUS,
                payload: { status: 'success', data: responseData }
            });
            enqueueSnackbar('Dashboard saved successfully', { variant: 'success' }); // Show success notification
            return { success: true, data: responseData };

        } catch (error) {
            console.error('Error saving dashboard to server:', error);
            const errorMsg = `Server save failed: ${error.message}`;
            dispatch({ type: ActionTypes.SET_SERVER_SYNC_STATUS, payload: { status: 'error' } });
            enqueueSnackbar(errorMsg, { variant: 'error' });
            return { success: false, message: error.message };
        } finally {
            if (isComponentMounted.current) {
                dispatch({ type: ActionTypes.STOP_SAVING });
            }
        }
    }, [enqueueSnackbar]);

    // Initial data loading strategy
    const loadInitialDashboards = useCallback(async () => {
        if (!isComponentMounted.current) return;
        dispatch({ type: ActionTypes.INITIAL_LOAD_START });

        let loadedDashboards = [];
        let selectedId = null;
        let loadSource = 'none'; // 'server', 'local', 'default'
        let notificationPayload = null;

        // 1. Try Server First
        try {
            const serverDashboards = await api.endpoints.getDashboards();
            if (serverDashboards && serverDashboards.length > 0) {
                console.log(`Loaded ${serverDashboards.length} dashboards from server.`);
                loadedDashboards = serverDashboards;
                selectedId = serverDashboards[0].id;
                loadSource = 'server';
                // Save server data to local storage immediately for offline fallback
                saveAllToLocalStorage(loadedDashboards);
            } else {
                // Server returned empty, treat as no dashboards found yet
                console.log("Server returned no dashboards.");
            }
        } catch (serverError) {
            console.error('Error fetching dashboards from server:', serverError);
            notificationPayload = { message: `Failed to sync with server: ${serverError.message}. Displaying local data if available.`, variant: 'warning' };
            // Proceed to try local storage
        }

        // 2. Try Local Storage if Server Failed or Returned Empty
        if (loadSource !== 'server') {
            try {
                const localDataStr = localStorage.getItem('dashboardData');
                if (localDataStr) {
                    const localData = JSON.parse(localDataStr);
                    if (localData.dashboards && localData.dashboards.length > 0) {
                        console.log(`Loaded ${localData.dashboards.length} dashboards from local storage.`);
                        loadedDashboards = localData.dashboards;
                        selectedId = loadedDashboards[0].id;
                        loadSource = 'local';
                    }
                }
            } catch (localError) {
                console.error('Error loading from local storage:', localError);
                notificationPayload = { message: `Error loading local data: ${localError.message}`, variant: 'error'};
            }
        }

        // 3. Create Default if Nothing Loaded
        if (loadedDashboards.length === 0) {
            console.log("Creating default dashboard.");
            loadSource = 'default';
            const timestamp = new Date().toISOString();
            const defaultDashboard = {
                id: 'dashboard-' + Date.now(),
                name: 'My Dashboard',
                widgets: [],
                layout: [],
                localLastModified: timestamp,
                serverLastModified: null // Indicate it hasn't been saved to server yet
            };
            loadedDashboards = [defaultDashboard];
            selectedId = defaultDashboard.id;
            saveAllToLocalStorage(loadedDashboards); // Save default locally
            // Attempt to save default to server in background - don't await
            saveDashboardToServer(defaultDashboard).catch(err => {
                console.error("Failed to save initial default dashboard to server:", err);
                // Update notification maybe? Or rely on user saving later.
                // Might need to set hasLocalChanges = true here
            });
            notificationPayload = { message: 'Created default dashboard', variant: 'info' };
        }

        // 4. Update State
        if (isComponentMounted.current) {
            const dashboardToLoad = loadedDashboards.find(d => d.id === selectedId);
            widgetActions.setWidgets(dashboardToLoad?.widgets || []);
            widgetActions.setLayout(dashboardToLoad?.layout || []);

            dispatch({
                type: ActionTypes.INITIAL_LOAD_SUCCESS,
                payload: {
                    dashboards: loadedDashboards,
                    selectedDashboardId: selectedId,
                    // Mark local changes only if loaded from local storage *because* server failed
                    hasLocalChanges: loadSource === 'local' && notificationPayload?.severity === 'warning',
                }
            });

            // Show notification if one was generated
            if (notificationPayload) {
                enqueueSnackbar(notificationPayload.message, { variant: notificationPayload.variant });
            }
        }
    }, [widgetActions, saveAllToLocalStorage, saveDashboardToServer, enqueueSnackbar]);

    // Add a new dashboard
    const handleAddDashboard = useCallback(async (event) => {
        // Prevent default if called from a button event
        if (event && typeof event.preventDefault === 'function') {
            event.preventDefault();
        }

        dispatch({ type: ActionTypes.START_LOADING });

        const newDashboard = {
            id: 'dashboard-' + Date.now(),
            name: 'New Dashboard',
            widgets: [],
            layout: [],
            localLastModified: new Date().toISOString()
        };
        dispatch({ type: ActionTypes.ADD_DASHBOARD_SUCCESS, payload: { newDashboard } }); // Optimistic update
        enqueueSnackbar('New dashboard created', { variant: 'success' });

        // Clear widget context for the new dashboard
        widgetActions.setWidgets([]);
        widgetActions.setLayout([]);

        // Persist the new dashboard to server (and implicitly updates local storage via effect)
        try {
            await saveDashboardToServer(newDashboard);
        } finally {
            if (isComponentMounted.current) {
                dispatch({ type: ActionTypes.STOP_LOADING });
            }
        }
    }, [widgetActions, saveDashboardToServer, enqueueSnackbar]);

    // Initiate dashboard deletion (opens confirmation dialog)
    const initiateDeleteDashboard = useCallback((dashboardId) => {
        if (!dashboardId) return;
        dispatch({ type: ActionTypes.SET_DASHBOARD_TO_DELETE, payload: dashboardId });
        dispatch({ type: ActionTypes.SET_CONFIRM_DELETE_OPEN, payload: true });
    }, []);

    // Close the delete confirmation dialog
    const handleCloseConfirmDelete = useCallback(() => {
        dispatch({ type: ActionTypes.SET_CONFIRM_DELETE_OPEN, payload: false });
        // Optionally clear the dashboardToDeleteId after a delay for animation
        setTimeout(() => dispatch({ type: ActionTypes.SET_DASHBOARD_TO_DELETE, payload: null }), 300);
    }, []);

    // Confirm and execute dashboard deletion
    const handleConfirmDeleteDashboard = useCallback(async () => {
        const dashboardIdToDelete = state.dashboardToDeleteId;
        if (!dashboardIdToDelete) return;

        // Close dialog immediately
        handleCloseConfirmDelete();

        // Find index before filtering
        const currentIndex = state.dashboards.findIndex(d => d.id === state.selectedDashboardId);
        const dashboardToDeleteIndex = state.dashboards.findIndex(d => d.id === dashboardIdToDelete);
        if (dashboardToDeleteIndex === -1) return;

        dispatch({ type: ActionTypes.START_SAVING });

        const newDashboards = state.dashboards.filter(d => d.id !== dashboardIdToDelete);
        let newSelectedId = state.selectedDashboardId;

        // Determine the next selected dashboard
        if (state.selectedDashboardId === dashboardIdToDelete) {
            newSelectedId = newDashboards.length > 0
                ? newDashboards[Math.min(currentIndex, newDashboards.length - 1)].id
                : null;
        }

        // Update local state first
        dispatch({
            type: ActionTypes.DELETE_DASHBOARD_SUCCESS,
            payload: { newDashboards, newSelectedId }
        });

        // Load the newly selected dashboard's content into widget context
        if (newSelectedId) {
            const selected = newDashboards.find(d => d.id === newSelectedId);
            if (selected) {
                widgetActions.setWidgets(selected.widgets || []);
                widgetActions.setLayout(selected.layout || []);
            }
        } else {
            // Handle case where last dashboard was deleted - create a new default one
            await handleAddDashboard(); // This will set widgets/layout
        }

        // Attempt server deletion
        try {
            await api.endpoints.deleteDashboard(dashboardIdToDelete);
            dispatch({ type: ActionTypes.SET_SERVER_SYNC_STATUS, payload: { status: 'success' }});
            enqueueSnackbar('Dashboard deleted successfully', { variant: 'success' });
        } catch (error) {
            console.error('Error deleting dashboard from server:', error);
            dispatch({ type: ActionTypes.SET_SERVER_SYNC_STATUS, payload: { status: 'warning' }});
            enqueueSnackbar('Dashboard deleted locally, but server sync failed.', { variant: 'warning' });
        } finally {
            if (isComponentMounted.current) {
                dispatch({ type: ActionTypes.STOP_SAVING }); // This stops the saving indicator
            }
        }
    }, [state.dashboards, state.selectedDashboardId, state.dashboardToDeleteId, widgetActions, handleAddDashboard, enqueueSnackbar]);

    // Select a dashboard (handles saving previous state implicitly via effect)
    const handleSelectDashboard = useCallback((event, newIndex) => {
        if (!state.initialized || newIndex < 0 || newIndex >= state.dashboards.length) return;

        const newSelectedId = state.dashboards[newIndex].id;
        if (newSelectedId === state.selectedDashboardId) return; // No change

        // The UPDATE_DASHBOARD_CONTENT effect will handle saving the current widgetState
        // before we switch. We just need to dispatch the selection change.

        dispatch({ type: ActionTypes.SET_SELECTED_DASHBOARD_ID, payload: newSelectedId });

        // Load the new dashboard's content into widget context
        const selectedDashboard = state.dashboards[newIndex];
        widgetActions.setWidgets(selectedDashboard.widgets || []);
        widgetActions.setLayout(selectedDashboard.layout || []);

    }, [state.initialized, state.dashboards, state.selectedDashboardId, widgetActions]);

    // Rename a dashboard
    const handleRenameDashboard = useCallback((dashboardId, newName) => {
        // Handle cancellation (entering edit mode)
        if (newName === undefined) {
            dispatch({ type: ActionTypes.SET_EDITING_DASHBOARD_ID, payload: dashboardId });
            return;
        }
        // Handle blur/escape (exiting edit mode without saving change if name is null)
        if (newName === null) {
            dispatch({ type: ActionTypes.SET_EDITING_DASHBOARD_ID, payload: null });
            return;
        }

        const trimmedName = newName.trim();
        if (!trimmedName) {
            enqueueSnackbar('Dashboard name cannot be empty', { variant: 'error' });
            dispatch({ type: ActionTypes.SET_EDITING_DASHBOARD_ID, payload: null }); // Exit edit mode on error
            return;
        }

        const dashboard = state.dashboards.find(d => d.id === dashboardId);
        if (!dashboard || dashboard.name === trimmedName) {
            dispatch({ type: ActionTypes.SET_EDITING_DASHBOARD_ID, payload: null }); // Exit if no change
            return;
        }

        // Update state optimistically
        dispatch({
            type: ActionTypes.RENAME_DASHBOARD_SUCCESS,
            payload: { id: dashboardId, name: trimmedName }
        });
        enqueueSnackbar(`Dashboard renamed to "${trimmedName}"`, { variant: 'success' });

        // Persist change to server (local storage updated by effect)
        const updatedDashboard = {
            ...dashboard,
            name: trimmedName,
            // Get current widgets/layout if this is the selected dashboard
            widgets: dashboardId === state.selectedDashboardId ? widgetState.widgets : dashboard.widgets,
            layout: dashboardId === state.selectedDashboardId ? widgetState.layout : dashboard.layout,
            localLastModified: new Date().toISOString()
        };
        saveDashboardToServer(updatedDashboard); // Handles its own saving state

    }, [state.dashboards, state.selectedDashboardId, widgetState.layout, widgetState.widgets, saveDashboardToServer, enqueueSnackbar]);

    // Add widget to the current dashboard
    const handleAddWidget = useCallback((widgetType) => {
        if (!state.selectedDashboardId) {
            enqueueSnackbar('No dashboard selected to add widget', { variant: 'error' });
            return;
        }
        dispatch({ type: ActionTypes.START_LOADING }); // Use general loading

        try {
            const widgetMeta = widgetRegistry[widgetType];
            if (!widgetMeta) throw new Error(`Widget type '${widgetType}' not found`);

            const widgetId = widgetActions.addWidget(widgetType, widgetMeta);
            enqueueSnackbar(`Added ${widgetMeta.title || widgetType} widget`, { variant: 'success' });
            return widgetId; // Return ID if needed

        } catch (error) {
            console.error('Error adding widget:', error);
            enqueueSnackbar(`Failed to add widget: ${error.message}`, { variant: 'error' });
            return null;
        } finally {
            if (isComponentMounted.current) {
                dispatch({ type: ActionTypes.STOP_LOADING });
            }
        }
    }, [state.selectedDashboardId, widgetActions, enqueueSnackbar]);

    // Remove widget from dashboard
    const handleRemoveWidget = useCallback((widgetId) => {
        if (!state.selectedDashboardId) return;
        //dispatch({ type: ActionTypes.START_LOADING }); // Use general loading

        try {
            widgetActions.removeWidget(widgetId);
            // The UPDATE_DASHBOARD_CONTENT effect will pick up this change
            enqueueSnackbar('Widget removed', { variant: 'info' });
        } catch (error) {
            console.error('Error removing widget:', error);
            enqueueSnackbar(`Failed to remove widget: ${error.message}`, { variant: 'error' });
        } finally {
            //if (isComponentMounted.current) {
            //dispatch({ type: ActionTypes.STOP_LOADING });
            //}
        }
    }, [state.selectedDashboardId, widgetActions, enqueueSnackbar]);

    // Manual save (sync) dashboard to server
    const syncWithServer = useCallback(() => {
        const currentDashboard = state.dashboards.find(d => d.id === state.selectedDashboardId);
        if (!currentDashboard) {
            enqueueSnackbar('No dashboard selected to save', { variant: 'error' });
            return;
        }

        // Ensure the dashboard object has the latest widget/layout state
        const dashboardToSave = {
            ...currentDashboard,
            widgets: widgetState.widgets,
            layout: widgetState.layout,
            localLastModified: new Date().toISOString()
        };

        // Update the main state immediately (optional, but keeps local state consistent)
        // dispatch({
        //     type: ActionTypes.UPDATE_DASHBOARD_CONTENT,
        //     payload: { dashboardId: state.selectedDashboardId, widgets: widgetState.widgets, layout: widgetState.layout }
        // });

        saveDashboardToServer(dashboardToSave); // Handles saving state and notifications

    }, [state.dashboards, state.selectedDashboardId, widgetState.widgets, widgetState.layout, saveDashboardToServer, enqueueSnackbar]);

    // --- Effects ---
    useEffect(() => {
        isComponentMounted.current = true;
        // Initial data load
        loadInitialDashboards();

        // Cleanup on unmount
        return () => {
            isComponentMounted.current = false;
            if (syncTimerId.current) {
                clearInterval(syncTimerId.current);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Effect to sync WidgetContext state back to the main dashboard state (debounced)
    const debouncedWidgetState = useDebounce(widgetState, 300); // Debounce changes from context

    useEffect(() => {
        if (!state.initialized || !state.selectedDashboardId) return;

        // Only dispatch if the content actually differs from what's in the reducer state
        const currentDashboardInState = state.dashboards.find(d => d.id === state.selectedDashboardId);
        if (!currentDashboardInState) return;

        const stateWidgetsString = JSON.stringify(currentDashboardInState.widgets || []);
        const contextWidgetsString = JSON.stringify(debouncedWidgetState.widgets);
        const stateLayoutString = JSON.stringify(currentDashboardInState.layout || []);
        const contextLayoutString = JSON.stringify(debouncedWidgetState.layout);

        if (stateWidgetsString !== contextWidgetsString || stateLayoutString !== contextLayoutString) {
            // console.log("Syncing widget context to reducer state for dashboard:", state.selectedDashboardId);
            dispatch({
                type: ActionTypes.UPDATE_DASHBOARD_CONTENT,
                payload: {
                    dashboardId: state.selectedDashboardId,
                    widgets: debouncedWidgetState.widgets,
                    layout: debouncedWidgetState.layout
                }
            });
        }

    }, [debouncedWidgetState, state.selectedDashboardId, state.initialized, state.dashboards]);

    // Effect to save all dashboards to local storage (debounced)
    const debouncedDashboards = useDebounce(state.dashboards, 500); // Debounce changes to the main dashboard array

    useEffect(() => {
        if (state.initialized && debouncedDashboards.length > 0) {
            // console.log("Saving dashboards to local storage");
            saveAllToLocalStorage(debouncedDashboards);
        }
    }, [debouncedDashboards, state.initialized, saveAllToLocalStorage]);

    useEffect(() => {
        if (autoSync && state.hasLocalChanges && !state.isSaving && state.serverSyncStatus !== 'syncing') {
            console.log("Auto-sync triggered");
            // Clear existing timer if any
            if (syncTimerId.current) clearInterval(syncTimerId.current);

            // Set up interval to attempt sync
            syncTimerId.current = setInterval(() => {
                // Double-check conditions inside interval callback
                if (isComponentMounted.current && state.hasLocalChanges && !state.isSaving && state.serverSyncStatus !== 'syncing') {
                    console.log("Attempting auto-sync...");
                    syncWithServer();
                } else {
                    // If no changes or already syncing, clear the timer
                    if (syncTimerId.current) {
                        clearInterval(syncTimerId.current);
                        syncTimerId.current = null;
                        console.log("Auto-sync interval cleared (no changes or already syncing).");
                    }
                }
            }, 300000); // 5 minutes

            // Cleanup timer on effect change or unmount
            return () => {
                if (syncTimerId.current) {
                    clearInterval(syncTimerId.current);
                    syncTimerId.current = null;
                    console.log("Auto-sync interval cleared on effect cleanup.");
                }
            };
        } else {
            // If auto-sync is off, or no changes, or already saving, clear any existing timer
            if (syncTimerId.current) {
                clearInterval(syncTimerId.current);
                syncTimerId.current = null;
                console.log("Auto-sync interval cleared (conditions not met).");
            }
        }
        // Depend on the relevant state values
    }, [autoSync, state.hasLocalChanges, state.isSaving, state.serverSyncStatus, syncWithServer]);

    const layoutMap = useMemo(() => {
        const map = new Map();
        if (Array.isArray(widgetState.layout)) {
            widgetState.layout.forEach(item => map.set(item.i, item));
        }
        return map;
    }, [widgetState.layout]);

    const commonWidgetData = useMemo(() => ({
        dashboardId: state.selectedDashboardId
    }), [state.selectedDashboardId]);

    const selectedIndex = useMemo(() => {
        return state.dashboards.findIndex(d => d.id === state.selectedDashboardId);
    }, [state.dashboards, state.selectedDashboardId]);

    // Find the name of the dashboard to delete for the confirmation dialog
    const dashboardNameToDelete = useMemo(() => {
        return state.dashboards.find(d => d.id === state.dashboardToDeleteId)?.name || 'this dashboard';
    }, [state.dashboards, state.dashboardToDeleteId]);

    // Loading state fallback for initialization
    if (!state.initialized && state.isLoading) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
                <CircularProgress color="secondary" sx={{ mb: 3 }} />
                <Typography variant="h6" color="textSecondary">Loading Dashboards...</Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Dashboard Tabs Header */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', px: 2, backgroundColor: 'rgba(0,0,0,0.05)' }}>
                <DashboardTabs
                    dashboards={state.dashboards}
                    selectedIndex={selectedIndex !== -1 ? selectedIndex : 0} // Handle case where selectedIndex is -1
                    onSelectDashboard={handleSelectDashboard}
                    onEditName={handleRenameDashboard} // Pass the callback directly
                    onDeleteDashboard={initiateDeleteDashboard} // Use initiateDeleteDashboard
                    editingDashboardId={state.editingDashboardId}
                    loading={state.isLoading || state.isSaving} // Combine loading states for tabs
                />

                <Box sx={{ display: 'flex', alignItems: 'center', ml: 1, gap: 1 }}>
                    <Tooltip title="Save Changes to Server">
                        <span> {/* Span needed for tooltip on disabled button */}
                            <ButtonLoader
                                variant="contained"
                                color="primary"
                                onClick={syncWithServer}
                                loading={state.isSaving || state.serverSyncStatus === 'syncing'}
                                disabled={!state.hasLocalChanges}
                                startIcon={<SaveIcon />}
                            >
                                 Save
                            </ButtonLoader>
                        </span>
                    </Tooltip>
                    <Tooltip title="Add New Dashboard">
                        <span>
                            <ButtonLoader
                                variant="outlined"
                                color="secondary"
                                onClick={handleAddDashboard}
                                loading={state.isLoading && !state.isSaving} // Show loading only for add, not save
                                startIcon={(state.isLoading || state.isSaving) ? <CircularProgress size={20} /> : <AddIcon />}
                            >
                                 New
                            </ButtonLoader>
                        </span>
                    </Tooltip>
                    {/* Optional: Toggle for Auto-Sync */}
                    {/* <FormControlLabel control={<Switch checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} />} label="Auto Sync" /> */}
                </Box>
            </Box>

            {/* Grid Layout with Widgets */}
            <Box sx={{ flexGrow: 1, p: 2, overflow: 'auto', position: 'relative' }}>
                {state.dashboards.length > 0 && state.selectedDashboardId && (
                    <ResponsiveGridLayout
                        draggableCancel=".MuiIconButton-root, .no-drag"
                        className="layout"
                        // Pass layout directly, react-grid-layout handles memoization internally if layouts identity doesn't change
                        layouts={{ lg: widgetState.layout, md: widgetState.layout, sm: widgetState.layout, xs: widgetState.layout, xxs: widgetState.layout }}
                        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                        cols={{ lg: 12, md: 12, sm: 12, xs: 12, xxs: 12 }}
                        rowHeight={35}
                        onLayoutChange={(currentLayout) => {
                            widgetActions.updateLayout(currentLayout);
                            dispatch({ type: ActionTypes.SET_HAS_LOCAL_CHANGES, payload: true });
                        }}
                        margin={[16, 16]}
                        containerPadding={[0, 0]}
                    >
                        {/* Ensure widgets is an array */}
                        {(widgetState.widgets || []).map(widget => {
                            // --- Optimization: Use the layout map ---
                            const layoutItem = layoutMap.get(widget.id);
                            // --- End Optimization ---
                            return (
                                <div key={widget.id}>
                                    <WidgetContainer
                                        widget={widget}
                                        onDelete={handleRemoveWidget}
                                        layoutItem={layoutItem}
                                        commonData={commonWidgetData}
                                    />
                                </div>
                            );
                        })}
                    </ResponsiveGridLayout>
                )}
                {state.dashboards.length === 0 && state.initialized && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%'}}>
                        <Typography variant="h6" color="textSecondary">No dashboards exist. Click 'New' to create one.</Typography>
                    </Box>
                )}
            </Box>

            {/* Add Widget Button & Preview Dialog */}
            {state.dashboards.length > 0 && ( // Only show button if dashboards exist
                <>
                    <AddWidgetButton onClick={() => dispatch({ type: ActionTypes.SET_PREVIEW_OPEN, payload: true })} />
                    <WidgetPreviewPopup
                        open={state.previewOpen}
                        onClose={() => dispatch({ type: ActionTypes.SET_PREVIEW_OPEN, payload: false })}
                        onSelect={handleAddWidget}
                    />
                </>
            )}


            {/* Loading Overlay for saving/syncing */}
            <LoadingOverlay
                open={state.isSaving || state.serverSyncStatus === 'syncing'} // Show during save/sync
                message="Saving..."
                fullPage={false} // Make it relative to the main content area
                zIndex={1100} // Ensure it's above other elements like sidebar
            />

            {/* Unsaved Changes Indicator */}
            {state.hasLocalChanges && !state.isSaving && (
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
                        zIndex: 1000,
                        border: '1px solid',
                        borderColor: 'warning.main'
                    }}
                >
                    <Typography variant="body2" sx={{ mr: 2 }} color="text.secondary">
                        Unsaved changes
                    </Typography>
                    <ButtonLoader
                        variant="contained"
                        size="small"
                        onClick={syncWithServer}
                        loading={state.isSaving || state.serverSyncStatus === 'syncing'}
                    >
                        Save Now
                    </ButtonLoader>
                </Box>
            )}

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={state.confirmDeleteDialogOpen}
                onClose={handleCloseConfirmDelete}
                aria-labelledby="alert-dialog-title"
                aria-describedby="alert-dialog-description"
            >
                <DialogTitle id="alert-dialog-title">Confirm Deletion</DialogTitle>
                <DialogContent>
                    <DialogContentText id="alert-dialog-description">
                        Are you sure you want to delete the dashboard "{dashboardNameToDelete}"? This action cannot be undone.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseConfirmDelete} color="primary">
                        Cancel
                    </Button>
                    <Button onClick={handleConfirmDeleteDashboard} color="error" autoFocus>
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>
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