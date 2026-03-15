// File: src/widgets/StandardComponents/WidgetContext.tsx
import React, { createContext, useContext, useReducer, useMemo } from 'react';
import type { Widget, WidgetConfig, WidgetMeta, LayoutItem } from '@/types';
import { widgetRegistry } from '../registry/WidgetRegistry';

// State interface
interface WidgetState {
  widgets: Widget[];
  layout: LayoutItem[];
}

// Action types
interface AddWidgetAction {
  type: typeof ActionTypes.ADD_WIDGET;
  payload: { widget: Widget; layoutItem: LayoutItem };
}

interface RemoveWidgetAction {
  type: typeof ActionTypes.REMOVE_WIDGET;
  payload: string;
}

interface UpdateWidgetConfigAction {
  type: typeof ActionTypes.UPDATE_WIDGET_CONFIG;
  payload: { widgetId: string; newConfig: WidgetConfig };
}

interface SetWidgetsAction {
  type: typeof ActionTypes.SET_WIDGETS;
  payload: Widget[];
}

interface SetLayoutAction {
  type: typeof ActionTypes.SET_LAYOUT;
  payload: LayoutItem[];
}

interface UpdateLayoutAction {
  type: typeof ActionTypes.UPDATE_LAYOUT;
  payload: LayoutItem[];
}

type WidgetAction =
  | AddWidgetAction
  | RemoveWidgetAction
  | UpdateWidgetConfigAction
  | SetWidgetsAction
  | SetLayoutAction
  | UpdateLayoutAction;

// Actions interface
interface WidgetActions {
  addWidget: (widgetType: string, widgetMeta: WidgetMeta) => string | null;
  removeWidget: (id: string) => void;
  updateWidgetConfig: (widgetId: string, newConfig: WidgetConfig) => void;
  setWidgets: (widgets: Widget[]) => void;
  setLayout: (layout: LayoutItem[], widgets?: Widget[]) => void;
  updateLayout: (newLayout: LayoutItem[]) => void;
}

// Context value interface
interface WidgetContextValue {
  state: WidgetState;
  actions: WidgetActions;
}

// Initial state
const initialState: WidgetState = {
  widgets: [],
  layout: [],
};

// Apply current registry minW/minH to layout items so that saved layouts
// with outdated constraints are corrected on load.
const normalizeLayoutConstraints = (layout: LayoutItem[], widgets: Widget[]): LayoutItem[] => {
  // Build a quick id->type lookup from the widgets array
  const typeById: Record<string, string> = {};
  if (Array.isArray(widgets)) {
    widgets.forEach((w) => {
      if (w.id && w.type) typeById[w.id] = w.type;
    });
  }

  return layout.map((item) => {
    const widgetType = typeById[item.i];
    // eslint-disable-next-line security/detect-object-injection -- widgetType is derived from widget registry keys
    const meta = widgetType && widgetRegistry[widgetType];
    if (!meta) return item;

    return {
      ...item,
      minW: meta.minW ?? item.minW,
      minH: meta.minH ?? item.minH,
    };
  });
};

// Action types as constants for better maintainability
export const ActionTypes = {
  ADD_WIDGET: 'ADD_WIDGET',
  REMOVE_WIDGET: 'REMOVE_WIDGET',
  UPDATE_WIDGET_CONFIG: 'UPDATE_WIDGET_CONFIG',
  SET_WIDGETS: 'SET_WIDGETS',
  SET_LAYOUT: 'SET_LAYOUT',
  UPDATE_LAYOUT: 'UPDATE_LAYOUT',
} as const;

// Helper function to safely update widget config
const updateWidgetConfigHelper = (
  widgets: Widget[],
  widgetId: string,
  newConfig: WidgetConfig,
): Widget[] => {
  if (!widgetId || !newConfig) return widgets;

  return widgets.map((w) =>
    w.id === widgetId ? { ...w, config: { ...w.config, ...newConfig } } : w,
  );
};

// Improved reducer with atomic state updates and validation
/**
 *
 * @param state
 * @param action
 */
function widgetReducer(state: WidgetState, action: WidgetAction): WidgetState {
  switch (action.type) {
    case ActionTypes.ADD_WIDGET: {
      const { widget, layoutItem } = action.payload;

      // Validate input
      if (!widget || !widget.id || !layoutItem || !layoutItem.i) {
        console.error('Invalid widget or layout item', widget, layoutItem);
        return state;
      }

      // Check for duplicates
      if (state.widgets.some((w) => w.id === widget.id)) {
        console.error('Widget with this ID already exists', widget.id);
        return state;
      }

      // Add widget and layout atomically
      return {
        ...state,
        widgets: [...state.widgets, widget],
        layout: [...state.layout, layoutItem],
      };
    }

    case ActionTypes.REMOVE_WIDGET: {
      const widgetId = action.payload;

      // Validate input
      if (!widgetId) {
        console.error('Invalid widget ID for removal', widgetId);
        return state;
      }

      // Remove widget and layout atomically
      return {
        ...state,
        widgets: state.widgets.filter((w) => w.id !== widgetId),
        layout: state.layout.filter((item) => item.i !== widgetId),
      };
    }

    case ActionTypes.UPDATE_WIDGET_CONFIG: {
      const { widgetId, newConfig } = action.payload;

      // Validate input
      if (!widgetId || !newConfig) {
        console.error('Invalid widget ID or config for update', widgetId, newConfig);
        return state;
      }

      // Find the widget to update
      const widgetIndex = state.widgets.findIndex((w) => w.id === widgetId);
      if (widgetIndex === -1) {
        console.error('Widget not found for config update', widgetId);
        return state;
      }

      // Update only the config, preserving other widget properties
      return {
        ...state,
        widgets: updateWidgetConfigHelper(state.widgets, widgetId, newConfig),
      };
    }

    case ActionTypes.SET_WIDGETS: {
      const widgets = action.payload;

      // Validate input
      if (!Array.isArray(widgets)) {
        console.error('Invalid widgets array', widgets);
        return state;
      }

      return {
        ...state,
        widgets,
      };
    }

    case ActionTypes.SET_LAYOUT: {
      const layout = action.payload;

      // Validate input
      if (!Array.isArray(layout)) {
        console.error('Invalid layout array', layout);
        return state;
      }

      return {
        ...state,
        layout,
      };
    }

    case ActionTypes.UPDATE_LAYOUT: {
      const newLayout = action.payload;

      // Validate input
      if (!Array.isArray(newLayout)) {
        console.error('Invalid layout for update', newLayout);
        return state;
      }

      // Normalize constraints from the registry so stale minW/minH
      // values from react-grid-layout callbacks are corrected.
      const normalized = normalizeLayoutConstraints(newLayout, state.widgets);

      // Only update if layout has actually changed
      if (JSON.stringify(normalized) === JSON.stringify(state.layout)) {
        return state;
      }

      return {
        ...state,
        layout: normalized,
      };
    }

    default:
      return state;
  }
}

// Create the context
const WidgetContext = createContext<WidgetContextValue | undefined>(undefined);

// Provider component
interface WidgetProviderProps {
  children: React.ReactNode;
}

/**
 *
 * @param root0
 * @param root0.children
 */
export function WidgetProvider({ children }: WidgetProviderProps) {
  const [state, dispatch] = useReducer(widgetReducer, initialState);

  // Memoize actions to prevent unnecessary re-renders
  const actions = useMemo(
    (): WidgetActions => ({
      addWidget: (widgetType: string, widgetMeta: WidgetMeta): string | null => {
        if (!widgetType || !widgetMeta) {
          console.error('Invalid widget type or metadata', widgetType, widgetMeta);
          return null;
        }

        const newId = 'widget-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        const widget: Widget = {
          id: newId,
          type: widgetType,
          config: widgetMeta.defaultConfig || {},
        };

        const layoutItem: LayoutItem = {
          i: newId,
          x: 0,
          y: Infinity, // Place at the bottom
          w: widgetMeta.defaultW || widgetMeta.minW || 4,
          h: widgetMeta.defaultH || widgetMeta.minH || 4,
          minW: widgetMeta.minW || 2,
          minH: widgetMeta.minH || 2,
        };

        dispatch({
          type: ActionTypes.ADD_WIDGET,
          payload: { widget, layoutItem },
        });

        return newId;
      },

      removeWidget: (id: string): void => {
        if (!id) {
          console.error('Invalid widget ID for removal');
          return;
        }

        dispatch({
          type: ActionTypes.REMOVE_WIDGET,
          payload: id,
        });
      },

      updateWidgetConfig: (widgetId: string, newConfig: WidgetConfig): void => {
        if (!widgetId || !newConfig) {
          console.error('Invalid widget ID or config for update');
          return;
        }

        dispatch({
          type: ActionTypes.UPDATE_WIDGET_CONFIG,
          payload: { widgetId, newConfig },
        });
      },

      setWidgets: (widgets: Widget[]): void => {
        dispatch({
          type: ActionTypes.SET_WIDGETS,
          payload: Array.isArray(widgets) ? widgets : [], // Ensure valid array
        });
      },

      setLayout: (layout: LayoutItem[], widgets?: Widget[]): void => {
        const validLayout = Array.isArray(layout) ? layout : [];
        // Normalize minW/minH from the registry so saved layouts pick up
        // current constraints instead of stale ones.
        const normalized = widgets ? normalizeLayoutConstraints(validLayout, widgets) : validLayout;

        dispatch({
          type: ActionTypes.SET_LAYOUT,
          payload: normalized,
        });
      },

      updateLayout: (newLayout: LayoutItem[]): void => {
        if (!Array.isArray(newLayout)) {
          console.error('Invalid layout for update');
          return;
        }

        dispatch({
          type: ActionTypes.UPDATE_LAYOUT,
          payload: newLayout,
        });
      },
    }),
    [],
  ); // Empty dependency array as these actions don't depend on state

  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = useMemo((): WidgetContextValue => ({ state, actions }), [state, actions]);

  return <WidgetContext.Provider value={contextValue}>{children}</WidgetContext.Provider>;
}

// Custom hook to use the widget context
/**
 *
 */
export function useWidgets(): WidgetContextValue {
  const context = useContext(WidgetContext);
  if (!context) {
    throw new Error('useWidgets must be used within a WidgetProvider');
  }
  return context;
}
