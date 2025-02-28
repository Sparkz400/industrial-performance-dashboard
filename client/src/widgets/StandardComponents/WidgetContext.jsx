// File: src/widgets/StandardComponents/WidgetContext.jsx
import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react';

// Initial state
const initialState = {
    widgets: [],
    layout: [],
};

// Action types as constants for better maintainability
export const ActionTypes = {
    ADD_WIDGET: 'ADD_WIDGET',
    REMOVE_WIDGET: 'REMOVE_WIDGET',
    UPDATE_WIDGET_CONFIG: 'UPDATE_WIDGET_CONFIG',
    SET_WIDGETS: 'SET_WIDGETS',
    SET_LAYOUT: 'SET_LAYOUT',
    UPDATE_LAYOUT: 'UPDATE_LAYOUT',
};

// Helper function to safely update widget config
const updateWidgetConfig = (widgets, widgetId, newConfig) => {
    if (!widgetId || !newConfig) return widgets;

    return widgets.map(w =>
        w.id === widgetId
            ? { ...w, config: { ...w.config, ...newConfig } }
            : w
    );
};

// Improved reducer with atomic state updates and validation
function widgetReducer(state, action) {
    switch (action.type) {
        case ActionTypes.ADD_WIDGET: {
            const { widget, layoutItem } = action.payload;

            // Validate input
            if (!widget || !widget.id || !layoutItem || !layoutItem.i) {
                console.error('Invalid widget or layout item', widget, layoutItem);
                return state;
            }

            // Check for duplicates
            if (state.widgets.some(w => w.id === widget.id)) {
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
                widgets: state.widgets.filter(w => w.id !== widgetId),
                layout: state.layout.filter(item => item.i !== widgetId),
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
            const widgetIndex = state.widgets.findIndex(w => w.id === widgetId);
            if (widgetIndex === -1) {
                console.error('Widget not found for config update', widgetId);
                return state;
            }

            // Update only the config, preserving other widget properties
            return {
                ...state,
                widgets: updateWidgetConfig(state.widgets, widgetId, newConfig),
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

            // Only update if layout has actually changed
            if (JSON.stringify(newLayout) === JSON.stringify(state.layout)) {
                return state;
            }

            return {
                ...state,
                layout: newLayout,
            };
        }

        default:
            return state;
    }
}

// Create the context
const WidgetContext = createContext();

// Provider component
export function WidgetProvider({ children }) {
    const [state, dispatch] = useReducer(widgetReducer, initialState);

    // Memoize actions to prevent unnecessary re-renders
    const actions = useMemo(() => ({
        addWidget: (widgetType, widgetMeta) => {
            if (!widgetType || !widgetMeta) {
                console.error('Invalid widget type or metadata', widgetType, widgetMeta);
                return null;
            }

            const newId = 'widget-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
            const widget = {
                id: newId,
                type: widgetType,
                config: widgetMeta.defaultConfig || {}
            };

            const layoutItem = {
                i: newId,
                x: 0,
                y: Infinity, // Place at the bottom
                w: widgetMeta.minW || 4,
                h: widgetMeta.minH || 4,
                minW: widgetMeta.minW || 2,
                minH: widgetMeta.minH || 2,
            };

            dispatch({
                type: ActionTypes.ADD_WIDGET,
                payload: { widget, layoutItem },
            });

            return newId;
        },

        removeWidget: (id) => {
            if (!id) {
                console.error('Invalid widget ID for removal');
                return;
            }

            dispatch({
                type: ActionTypes.REMOVE_WIDGET,
                payload: id,
            });
        },

        updateWidgetConfig: (widgetId, newConfig) => {
            if (!widgetId || !newConfig) {
                console.error('Invalid widget ID or config for update');
                return;
            }

            dispatch({
                type: ActionTypes.UPDATE_WIDGET_CONFIG,
                payload: { widgetId, newConfig },
            });
        },

        setWidgets: (widgets) => {
            dispatch({
                type: ActionTypes.SET_WIDGETS,
                payload: Array.isArray(widgets) ? widgets : [], // Ensure valid array
            });
        },

        setLayout: (layout) => {
            dispatch({
                type: ActionTypes.SET_LAYOUT,
                payload: Array.isArray(layout) ? layout : [], // Ensure valid array
            });
        },

        updateLayout: (newLayout) => {
            if (!Array.isArray(newLayout)) {
                console.error('Invalid layout for update');
                return;
            }

            dispatch({
                type: ActionTypes.UPDATE_LAYOUT,
                payload: newLayout,
            });
        },
    }), []); // Empty dependency array as these actions don't depend on state

    // Memoize the context value to prevent unnecessary re-renders
    const contextValue = useMemo(() => ({ state, actions }), [state, actions]);

    return (
        <WidgetContext.Provider value={contextValue}>
            {children}
        </WidgetContext.Provider>
    );
}

// Custom hook to use the widget context
export function useWidgets() {
    const context = useContext(WidgetContext);
    if (!context) {
        throw new Error('useWidgets must be used within a WidgetProvider');
    }
    return context;
}