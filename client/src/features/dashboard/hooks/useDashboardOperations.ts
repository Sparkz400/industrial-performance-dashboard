import { useCallback, useRef, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';

import api from '@/utils/api';
import { widgetRegistry } from '../../widgets/registry/WidgetRegistry';
import { useWidgetStore } from '@/stores/useWidgetStore';
import { ActionTypes, useDebounce } from './useDashboardState';

import type { Dashboard, DashboardTemplate, WidgetMeta } from '@/types';
import type { DashboardState, DashboardAction } from './useDashboardState';

interface UseDashboardOperationsParams {
  state: DashboardState;
  dispatch: React.Dispatch<DashboardAction>;
}

/**
 *
 * @param root0
 * @param root0.state
 * @param root0.dispatch
 */
export function useDashboardOperations({ state, dispatch }: UseDashboardOperationsParams) {
  const { id: routeDashboardId } = useParams<{ id?: string }>();
  const { enqueueSnackbar } = useSnackbar();

  // Zustand widget store
  const widgets = useWidgetStore((s) => s.widgets);
  const layout = useWidgetStore((s) => s.layout);
  const setWidgets = useWidgetStore((s) => s.setWidgets);
  const setLayout = useWidgetStore((s) => s.setLayout);
  const updateLayout = useWidgetStore((s) => s.updateLayout);
  const addWidget = useWidgetStore((s) => s.addWidget);
  const removeWidget = useWidgetStore((s) => s.removeWidget);

  const syncTimerId = useRef<ReturnType<typeof setInterval> | null>(null);
  const isComponentMounted = useRef<boolean>(true);

  // Save to local storage
  const saveAllToLocalStorage = useCallback((dashboardsToSave: Dashboard[]) => {
    if (!isComponentMounted.current) return;
    try {
      const localData = { dashboards: dashboardsToSave, lastSavedLocal: new Date().toISOString() };
      localStorage.setItem('dashboardData', JSON.stringify(localData));
    } catch (error) {
      console.error('Failed to save to local storage:', error);
    }
  }, []);

  // Save to server
  const saveDashboardToServer = useCallback(
    async (dashboard: Dashboard): Promise<{ success: boolean; data?: Dashboard }> => {
      if (!dashboard || !dashboard.id) return { success: false };
      dispatch({ type: ActionTypes.START_SAVING });
      try {
        const dashboardToSave = {
          ...dashboard,
          widgets: Array.isArray(dashboard.widgets) ? dashboard.widgets : [],
          layout: Array.isArray(dashboard.layout) ? dashboard.layout : [],
          serverLastModified: new Date().toISOString(),
        };
        const responseData = (await api.endpoints.saveDashboard(dashboardToSave)) as Dashboard;
        dispatch({
          type: ActionTypes.SET_SERVER_SYNC_STATUS,
          payload: { status: 'success', data: responseData },
        });
        enqueueSnackbar('Dashboard saved successfully', { variant: 'success' });
        return { success: true, data: responseData };
      } catch (error: unknown) {
        dispatch({ type: ActionTypes.SET_SERVER_SYNC_STATUS, payload: { status: 'error' } });
        const message = error instanceof Error ? error.message : 'Unknown error';
        enqueueSnackbar(`Server save failed: ${message}`, { variant: 'error' });
        return { success: false };
      } finally {
        if (isComponentMounted.current) dispatch({ type: ActionTypes.STOP_SAVING });
      }
    },
    [enqueueSnackbar, dispatch],
  );

  // Load dashboards
  const loadInitialDashboards = useCallback(async () => {
    if (!isComponentMounted.current) return;
    dispatch({ type: ActionTypes.INITIAL_LOAD_START });

    let loadedDashboards: Dashboard[] = [];
    let selectedId: string | null = null;
    let loadSource: 'none' | 'server' | 'local' = 'none';

    try {
      const serverDashboards = await api.endpoints.getDashboards();
      if (Array.isArray(serverDashboards) && serverDashboards.length > 0) {
        loadedDashboards = serverDashboards;
        if (routeDashboardId && serverDashboards.some((d) => d.id === routeDashboardId)) {
          selectedId = routeDashboardId;
        } else {
          selectedId = serverDashboards[0].id;
        }
        loadSource = 'server';
        saveAllToLocalStorage(loadedDashboards);
      }
    } catch (serverError) {
      console.error('Error fetching dashboards from server:', serverError);
    }

    if (loadSource !== 'server') {
      try {
        const localDataStr = localStorage.getItem('dashboardData');
        if (localDataStr) {
          const localData = JSON.parse(localDataStr);
          if (Array.isArray(localData.dashboards) && localData.dashboards.length > 0) {
            loadedDashboards = localData.dashboards;
            selectedId = localData.selectedDashboardId || localData.dashboards[0].id;
            loadSource = 'local';
          }
        }
      } catch (localError) {
        console.error('Error loading from local storage:', localError);
      }
    }

    if (loadedDashboards.length === 0) {
      const defaultDashboard: Dashboard = {
        id: 'dashboard-' + Date.now(),
        name: 'My Dashboard',
        widgets: [],
        layout: [],
        localLastModified: new Date().toISOString(),
        serverLastModified: null,
      };
      loadedDashboards = [defaultDashboard];
      selectedId = defaultDashboard.id;
      saveAllToLocalStorage(loadedDashboards);
      saveDashboardToServer(defaultDashboard).catch(() => {});
    }

    if (!isComponentMounted.current) return;

    const dashboardToLoad =
      loadedDashboards.find((d) => d.id === selectedId) || loadedDashboards[0];
    const loadedWidgets = dashboardToLoad?.widgets || [];
    const loadedLayout = dashboardToLoad?.layout || [];
    setWidgets(loadedWidgets);
    setLayout(loadedLayout, loadedWidgets);

    dispatch({
      type: ActionTypes.INITIAL_LOAD_SUCCESS,
      payload: {
        dashboards: loadedDashboards,
        selectedDashboardId: dashboardToLoad?.id || null,
        hasLocalChanges: false,
      },
    });
  }, [
    setWidgets,
    setLayout,
    saveAllToLocalStorage,
    saveDashboardToServer,
    routeDashboardId,
    dispatch,
  ]);

  // Add dashboard
  const handleAddDashboard = useCallback(
    async (event?: React.MouseEvent) => {
      if (event?.preventDefault) event.preventDefault();
      dispatch({ type: ActionTypes.START_LOADING });

      const newDashboard: Dashboard = {
        id: 'dashboard-' + Date.now(),
        name: 'New Dashboard',
        widgets: [],
        layout: [],
        localLastModified: new Date().toISOString(),
      };
      dispatch({ type: ActionTypes.ADD_DASHBOARD_SUCCESS, payload: { newDashboard } });
      enqueueSnackbar('New dashboard created', { variant: 'success' });
      setWidgets([]);
      setLayout([]);

      try {
        await saveDashboardToServer(newDashboard);
      } finally {
        if (isComponentMounted.current) dispatch({ type: ActionTypes.STOP_LOADING });
      }
    },
    [setWidgets, setLayout, saveDashboardToServer, enqueueSnackbar, dispatch],
  );

  // Apply template
  const handleApplyTemplate = useCallback(
    (template: DashboardTemplate) => {
      if (!state.selectedDashboardId) return;

      const timestamp = Date.now();
      const widgetIdMap: Record<string, string> = {};
      const newWidgets = template.widgets.map((w, i) => {
        const newId = `widget-${timestamp}-${i}`;
        widgetIdMap[w.id] = newId;
        return { ...w, id: newId };
      });
      const newLayout = template.layout.map((l) => ({
        ...l,
        i: widgetIdMap[l.i] || l.i,
      }));

      setWidgets(newWidgets);
      setLayout(newLayout, newWidgets);
      enqueueSnackbar(`Applied "${template.name}" template`, { variant: 'success' });
    },
    [state.selectedDashboardId, setWidgets, setLayout, enqueueSnackbar],
  );

  // Delete dashboard
  const initiateDeleteDashboard = useCallback(
    (dashboardId: string) => {
      if (!dashboardId) return;
      dispatch({ type: ActionTypes.SET_DASHBOARD_TO_DELETE, payload: dashboardId });
      dispatch({ type: ActionTypes.SET_CONFIRM_DELETE_OPEN, payload: true });
    },
    [dispatch],
  );

  const handleCloseConfirmDelete = useCallback(() => {
    dispatch({ type: ActionTypes.SET_CONFIRM_DELETE_OPEN, payload: false });
    setTimeout(() => dispatch({ type: ActionTypes.SET_DASHBOARD_TO_DELETE, payload: null }), 300);
  }, [dispatch]);

  const handleConfirmDeleteDashboard = useCallback(async () => {
    const dashboardIdToDelete = state.dashboardToDeleteId;
    if (!dashboardIdToDelete) return;
    handleCloseConfirmDelete();

    const currentIndex = state.dashboards.findIndex((d) => d.id === state.selectedDashboardId);
    const newDashboards = state.dashboards.filter((d) => d.id !== dashboardIdToDelete);
    let newSelectedId = state.selectedDashboardId;

    if (state.selectedDashboardId === dashboardIdToDelete) {
      newSelectedId =
        newDashboards.length > 0
          ? newDashboards[Math.min(currentIndex, newDashboards.length - 1)].id
          : null;
    }

    dispatch({
      type: ActionTypes.DELETE_DASHBOARD_SUCCESS,
      payload: { newDashboards, newSelectedId },
    });

    if (newSelectedId) {
      const selected = newDashboards.find((d) => d.id === newSelectedId);
      if (selected) {
        const selWidgets = selected.widgets || [];
        setWidgets(selWidgets);
        setLayout(selected.layout || [], selWidgets);
      }
    } else {
      await handleAddDashboard();
    }

    try {
      await api.endpoints.deleteDashboard(dashboardIdToDelete);
      dispatch({ type: ActionTypes.SET_SERVER_SYNC_STATUS, payload: { status: 'success' } });
      enqueueSnackbar('Dashboard deleted successfully', { variant: 'success' });
    } catch (_error) {
      enqueueSnackbar('Dashboard deleted locally, but server sync failed.', { variant: 'warning' });
    }
  }, [
    state.dashboards,
    state.selectedDashboardId,
    state.dashboardToDeleteId,
    setWidgets,
    setLayout,
    handleAddDashboard,
    handleCloseConfirmDelete,
    enqueueSnackbar,
    dispatch,
  ]);

  // Select dashboard
  const handleSelectDashboard = useCallback(
    (_event: React.SyntheticEvent, newIndex: number) => {
      if (!state.initialized || newIndex < 0 || newIndex >= state.dashboards.length) return;
      // eslint-disable-next-line security/detect-object-injection -- newIndex is bounds-checked above
      const newSelectedId = state.dashboards[newIndex].id;
      if (newSelectedId === state.selectedDashboardId) return;

      dispatch({ type: ActionTypes.SET_SELECTED_DASHBOARD_ID, payload: newSelectedId });
      // eslint-disable-next-line security/detect-object-injection -- newIndex is bounds-checked above
      const selectedDashboard = state.dashboards[newIndex];
      const switchWidgets = selectedDashboard.widgets || [];
      setWidgets(switchWidgets);
      setLayout(selectedDashboard.layout || [], switchWidgets);
    },
    [
      state.initialized,
      state.dashboards,
      state.selectedDashboardId,
      setWidgets,
      setLayout,
      dispatch,
    ],
  );

  // Rename dashboard
  const handleRenameDashboard = useCallback(
    (dashboardId: string, newName?: string | null) => {
      if (newName === undefined) {
        dispatch({ type: ActionTypes.SET_EDITING_DASHBOARD_ID, payload: dashboardId });
        return;
      }
      if (newName === null) {
        dispatch({ type: ActionTypes.SET_EDITING_DASHBOARD_ID, payload: null });
        return;
      }
      const trimmedName = newName.trim();
      if (!trimmedName) {
        enqueueSnackbar('Dashboard name cannot be empty', { variant: 'error' });
        dispatch({ type: ActionTypes.SET_EDITING_DASHBOARD_ID, payload: null });
        return;
      }
      const dashboard = state.dashboards.find((d) => d.id === dashboardId);
      if (!dashboard || dashboard.name === trimmedName) {
        dispatch({ type: ActionTypes.SET_EDITING_DASHBOARD_ID, payload: null });
        return;
      }
      dispatch({
        type: ActionTypes.RENAME_DASHBOARD_SUCCESS,
        payload: { id: dashboardId, name: trimmedName },
      });
      enqueueSnackbar(`Dashboard renamed to "${trimmedName}"`, { variant: 'success' });
      const updatedDashboard: Dashboard = {
        ...dashboard,
        name: trimmedName,
        widgets: dashboardId === state.selectedDashboardId ? widgets : dashboard.widgets,
        layout: dashboardId === state.selectedDashboardId ? layout : dashboard.layout,
        localLastModified: new Date().toISOString(),
      };
      saveDashboardToServer(updatedDashboard);
    },
    [
      state.dashboards,
      state.selectedDashboardId,
      widgets,
      layout,
      saveDashboardToServer,
      enqueueSnackbar,
      dispatch,
    ],
  );

  // Add widget
  const handleAddWidget = useCallback(
    (widgetType: string) => {
      if (!state.selectedDashboardId) return;
      try {
        // eslint-disable-next-line security/detect-object-injection -- widgetType is a known registry key
        const widgetMeta = (widgetRegistry as Record<string, WidgetMeta>)[widgetType];
        if (!widgetMeta) throw new Error(`Widget type '${widgetType}' not found`);
        addWidget(widgetType, widgetMeta);
        enqueueSnackbar(`Added ${widgetMeta.title || widgetType} widget`, { variant: 'success' });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        enqueueSnackbar(`Failed to add widget: ${message}`, { variant: 'error' });
      }
    },
    [state.selectedDashboardId, addWidget, enqueueSnackbar],
  );

  // Remove widget
  const handleRemoveWidget = useCallback(
    (widgetId: string) => {
      if (!state.selectedDashboardId) return;
      removeWidget(widgetId);
      enqueueSnackbar('Widget removed', { variant: 'info' });
    },
    [state.selectedDashboardId, removeWidget, enqueueSnackbar],
  );

  // Handle drop from widget library
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const widgetType = e.dataTransfer.getData('widgetType');
      if (widgetType) {
        handleAddWidget(widgetType);
      }
    },
    [handleAddWidget],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  // Sync to server
  const syncWithServer = useCallback(() => {
    const currentDashboard = state.dashboards.find((d) => d.id === state.selectedDashboardId);
    if (!currentDashboard) return;
    const dashboardToSave: Dashboard = {
      ...currentDashboard,
      widgets,
      layout,
      localLastModified: new Date().toISOString(),
    };
    saveDashboardToServer(dashboardToSave);
  }, [state.dashboards, state.selectedDashboardId, widgets, layout, saveDashboardToServer]);

  // --- Effects ---

  // Mount / unmount + initial load
  useEffect(() => {
    isComponentMounted.current = true;
    loadInitialDashboards();
    return () => {
      isComponentMounted.current = false;
      if (syncTimerId.current) clearInterval(syncTimerId.current);
    };
  }, []); // eslint-disable-line

  // Sync widget state to dashboard reducer
  const debouncedWidgets = useDebounce(widgets, 300);
  const debouncedLayout = useDebounce(layout, 300);

  useEffect(() => {
    if (!state.initialized || !state.selectedDashboardId) return;
    const currentDashboard = state.dashboards.find((d) => d.id === state.selectedDashboardId);
    if (!currentDashboard) return;

    const stateWidgetsStr = JSON.stringify(currentDashboard.widgets || []);
    const contextWidgetsStr = JSON.stringify(debouncedWidgets);
    const stateLayoutStr = JSON.stringify(currentDashboard.layout || []);
    const contextLayoutStr = JSON.stringify(debouncedLayout);

    if (stateWidgetsStr !== contextWidgetsStr || stateLayoutStr !== contextLayoutStr) {
      dispatch({
        type: ActionTypes.UPDATE_DASHBOARD_CONTENT,
        payload: {
          dashboardId: state.selectedDashboardId,
          widgets: debouncedWidgets,
          layout: debouncedLayout,
        },
      });
    }
  }, [
    debouncedWidgets,
    debouncedLayout,
    state.selectedDashboardId,
    state.initialized,
    state.dashboards,
    dispatch,
  ]);

  // Save to local storage
  const debouncedDashboards = useDebounce(state.dashboards, 500);
  useEffect(() => {
    if (state.initialized && debouncedDashboards.length > 0) {
      saveAllToLocalStorage(debouncedDashboards);
    }
  }, [debouncedDashboards, state.initialized, saveAllToLocalStorage]);

  // Auto-sync
  const [autoSync, setAutoSync] = useState<boolean>(false);

  useEffect(() => {
    if (autoSync && state.hasLocalChanges && !state.isSaving) {
      if (syncTimerId.current) clearInterval(syncTimerId.current);
      syncTimerId.current = setInterval(() => {
        if (isComponentMounted.current && state.hasLocalChanges && !state.isSaving) {
          syncWithServer();
        }
      }, 300000);
      return () => {
        if (syncTimerId.current) clearInterval(syncTimerId.current);
      };
    }
  }, [autoSync, state.hasLocalChanges, state.isSaving, syncWithServer]);

  return {
    // Widget store values
    widgets,
    layout,
    updateLayout,

    // Operations
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

    // Auto-sync state
    autoSync,
    setAutoSync,
  } as const;
}
