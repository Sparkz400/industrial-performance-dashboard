import { useReducer, useState, useEffect } from 'react';

import type { Widget, LayoutItem, Dashboard } from '@/types';

// --- Action Types ---
export const ActionTypes = {
  INITIAL_LOAD_START: 'INITIAL_LOAD_START',
  INITIAL_LOAD_SUCCESS: 'INITIAL_LOAD_SUCCESS',
  INITIAL_LOAD_FAIL: 'INITIAL_LOAD_FAIL',
  SET_SELECTED_DASHBOARD_ID: 'SET_SELECTED_DASHBOARD_ID',
  SET_EDITING_DASHBOARD_ID: 'SET_EDITING_DASHBOARD_ID',
  SET_PREVIEW_OPEN: 'SET_PREVIEW_OPEN',
  SET_CONFIRM_DELETE_OPEN: 'SET_CONFIRM_DELETE_OPEN',
  SET_DASHBOARD_TO_DELETE: 'SET_DASHBOARD_TO_DELETE',
  SET_DASHBOARDS: 'SET_DASHBOARDS',
  ADD_DASHBOARD_SUCCESS: 'ADD_DASHBOARD_SUCCESS',
  DELETE_DASHBOARD_SUCCESS: 'DELETE_DASHBOARD_SUCCESS',
  RENAME_DASHBOARD_SUCCESS: 'RENAME_DASHBOARD_SUCCESS',
  UPDATE_DASHBOARD_CONTENT: 'UPDATE_DASHBOARD_CONTENT',
  START_LOADING: 'START_LOADING',
  STOP_LOADING: 'STOP_LOADING',
  START_SAVING: 'START_SAVING',
  STOP_SAVING: 'STOP_SAVING',
  SET_HAS_LOCAL_CHANGES: 'SET_HAS_LOCAL_CHANGES',
  SET_SERVER_SYNC_STATUS: 'SET_SERVER_SYNC_STATUS',
} as const;

// --- State & Action Types ---
export type ServerSyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export interface DashboardState {
  dashboards: Dashboard[];
  selectedDashboardId: string | null;
  editingDashboardId: string | null;
  initialized: boolean;
  previewOpen: boolean;
  isLoading: boolean;
  isSaving: boolean;
  hasLocalChanges: boolean;
  serverSyncStatus: ServerSyncStatus;
  confirmDeleteDialogOpen: boolean;
  dashboardToDeleteId: string | null;
}

export type DashboardAction =
  | { type: typeof ActionTypes.INITIAL_LOAD_START }
  | {
      type: typeof ActionTypes.INITIAL_LOAD_SUCCESS;
      payload: {
        dashboards: Dashboard[];
        selectedDashboardId: string | null;
        hasLocalChanges: boolean;
      };
    }
  | { type: typeof ActionTypes.INITIAL_LOAD_FAIL }
  | { type: typeof ActionTypes.SET_DASHBOARDS; payload: Dashboard[] }
  | { type: typeof ActionTypes.ADD_DASHBOARD_SUCCESS; payload: { newDashboard: Dashboard } }
  | {
      type: typeof ActionTypes.DELETE_DASHBOARD_SUCCESS;
      payload: { newDashboards: Dashboard[]; newSelectedId: string | null };
    }
  | { type: typeof ActionTypes.RENAME_DASHBOARD_SUCCESS; payload: { id: string; name: string } }
  | {
      type: typeof ActionTypes.UPDATE_DASHBOARD_CONTENT;
      payload: { dashboardId: string; widgets: Widget[]; layout: LayoutItem[] };
    }
  | { type: typeof ActionTypes.SET_SELECTED_DASHBOARD_ID; payload: string | null }
  | { type: typeof ActionTypes.SET_EDITING_DASHBOARD_ID; payload: string | null }
  | { type: typeof ActionTypes.SET_PREVIEW_OPEN; payload: boolean }
  | { type: typeof ActionTypes.SET_CONFIRM_DELETE_OPEN; payload: boolean }
  | { type: typeof ActionTypes.SET_DASHBOARD_TO_DELETE; payload: string | null }
  | { type: typeof ActionTypes.START_LOADING }
  | { type: typeof ActionTypes.STOP_LOADING }
  | { type: typeof ActionTypes.START_SAVING }
  | { type: typeof ActionTypes.STOP_SAVING }
  | { type: typeof ActionTypes.SET_HAS_LOCAL_CHANGES; payload: boolean }
  | {
      type: typeof ActionTypes.SET_SERVER_SYNC_STATUS;
      payload: { status: ServerSyncStatus; data?: Dashboard };
    };

// --- Dashboard Reducer ---
/**
 *
 * @param state
 * @param action
 */
function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
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
        hasLocalChanges: action.payload.hasLocalChanges,
      };
    case ActionTypes.INITIAL_LOAD_FAIL:
      return { ...state, isLoading: false, initialized: true };
    case ActionTypes.SET_DASHBOARDS:
      return { ...state, dashboards: action.payload, hasLocalChanges: true };
    case ActionTypes.ADD_DASHBOARD_SUCCESS:
      return {
        ...state,
        isLoading: false,
        isSaving: false,
        dashboards: [...state.dashboards, action.payload.newDashboard],
        selectedDashboardId: action.payload.newDashboard.id,
        hasLocalChanges: true,
      };
    case ActionTypes.DELETE_DASHBOARD_SUCCESS:
      return {
        ...state,
        isLoading: false,
        isSaving: false,
        dashboards: action.payload.newDashboards,
        selectedDashboardId: action.payload.newSelectedId,
        hasLocalChanges: true,
      };
    case ActionTypes.RENAME_DASHBOARD_SUCCESS:
      return {
        ...state,
        isLoading: false,
        isSaving: false,
        editingDashboardId: null,
        dashboards: state.dashboards.map((d) =>
          d.id === action.payload.id
            ? { ...d, name: action.payload.name, localLastModified: new Date().toISOString() }
            : d,
        ),
        hasLocalChanges: true,
        serverSyncStatus: 'idle',
      };
    case ActionTypes.UPDATE_DASHBOARD_CONTENT:
      return {
        ...state,
        dashboards: state.dashboards.map((dashboard) =>
          dashboard.id === action.payload.dashboardId
            ? {
                ...dashboard,
                widgets: action.payload.widgets,
                layout: action.payload.layout,
                localLastModified: new Date().toISOString(),
              }
            : dashboard,
        ),
        hasLocalChanges: true,
      };
    case ActionTypes.SET_SELECTED_DASHBOARD_ID:
      return { ...state, selectedDashboardId: action.payload };
    case ActionTypes.SET_EDITING_DASHBOARD_ID:
      return { ...state, editingDashboardId: action.payload };
    case ActionTypes.SET_PREVIEW_OPEN:
      return { ...state, previewOpen: action.payload };
    case ActionTypes.SET_CONFIRM_DELETE_OPEN:
      return { ...state, confirmDeleteDialogOpen: action.payload };
    case ActionTypes.SET_DASHBOARD_TO_DELETE:
      return { ...state, dashboardToDeleteId: action.payload };
    case ActionTypes.START_LOADING:
      return { ...state, isLoading: true };
    case ActionTypes.STOP_LOADING:
      return { ...state, isLoading: false };
    case ActionTypes.START_SAVING:
      return { ...state, isSaving: true, serverSyncStatus: 'syncing' };
    case ActionTypes.STOP_SAVING:
      return { ...state, isSaving: false };
    case ActionTypes.SET_HAS_LOCAL_CHANGES:
      return { ...state, hasLocalChanges: action.payload };
    case ActionTypes.SET_SERVER_SYNC_STATUS: {
      const newState: DashboardState = { ...state, serverSyncStatus: action.payload.status };
      if (action.payload.status === 'success') {
        newState.hasLocalChanges = false;
      }
      if (action.payload.status === 'success' && action.payload.data && action.payload.data.id) {
        newState.dashboards = state.dashboards.map((d) =>
          d.id === action.payload.data!.id ? { ...action.payload.data! } : d,
        );
      }
      return newState;
    }
    default:
      return state;
  }
}

/**
 *
 * @param value
 * @param delay
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const initialState: DashboardState = {
  dashboards: [],
  selectedDashboardId: null,
  editingDashboardId: null,
  initialized: false,
  previewOpen: false,
  isLoading: false,
  isSaving: false,
  hasLocalChanges: false,
  serverSyncStatus: 'idle',
  confirmDeleteDialogOpen: false,
  dashboardToDeleteId: null,
};

/**
 *
 */
export function useDashboardState() {
  const [state, dispatch] = useReducer(dashboardReducer, initialState);
  return { state, dispatch } as const;
}
