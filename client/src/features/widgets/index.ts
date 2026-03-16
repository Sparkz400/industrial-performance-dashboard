// Re-export widget infrastructure — NOT individual widget components.
// Widget components are lazily loaded via WidgetRegistry.ts.
// Importing them here would defeat code-splitting.
export { default as WidgetContainer } from './components/WidgetContainer';
export { default as WidgetGrid } from './components/WidgetGrid';
export { default as WidgetPreviewPopup } from './components/WidgetPreviewPopup';
export { widgetRegistry, getWidgetsByCategory } from './registry/WidgetRegistry';
export { useWidgetStore } from '../../stores/useWidgetStore';
