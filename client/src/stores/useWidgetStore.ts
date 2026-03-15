import { create } from 'zustand';
import type { Widget, LayoutItem, WidgetConfig, WidgetMeta } from '../types';
import { widgetRegistry } from '../features/widgets/registry/WidgetRegistry';

interface WidgetState {
  widgets: Widget[];
  layout: LayoutItem[];
  fullscreenWidgetId: string | null;
  // Actions
  addWidget: (widgetType: string, widgetMeta: Partial<WidgetMeta>) => string | null;
  removeWidget: (id: string) => void;
  updateWidgetConfig: (widgetId: string, newConfig: WidgetConfig) => void;
  setWidgets: (widgets: Widget[]) => void;
  setLayout: (layout: LayoutItem[], widgets?: Widget[]) => void;
  updateLayout: (newLayout: LayoutItem[]) => void;
  setFullscreenWidget: (widgetId: string | null) => void;
}

const normalizeLayoutConstraints = (layout: LayoutItem[], widgets: Widget[]): LayoutItem[] => {
  const typeById: Record<string, string> = {};
  if (Array.isArray(widgets)) {
    widgets.forEach((w) => {
      if (w.id && w.type) typeById[w.id] = w.type;
    });
  }

  return layout.map((item) => {
    const widgetType = typeById[item.i];
    // eslint-disable-next-line security/detect-object-injection -- widgetType is derived from widget registry keys
    const meta = widgetType && (widgetRegistry as Record<string, WidgetMeta>)[widgetType];
    if (!meta) return item;

    return {
      ...item,
      minW: meta.minW ?? item.minW,
      minH: meta.minH ?? item.minH,
    };
  });
};

export const useWidgetStore = create<WidgetState>((set, get) => ({
  widgets: [],
  layout: [],
  fullscreenWidgetId: null,

  addWidget: (widgetType, widgetMeta) => {
    if (!widgetType || !widgetMeta) return null;

    const newId = 'widget-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const widget: Widget = {
      id: newId,
      type: widgetType,
      config: widgetMeta.defaultConfig || {},
    };

    const layoutItem: LayoutItem = {
      i: newId,
      x: 0,
      y: Infinity,
      w: widgetMeta.defaultW || widgetMeta.minW || 4,
      h: widgetMeta.defaultH || widgetMeta.minH || 4,
      minW: widgetMeta.minW || 2,
      minH: widgetMeta.minH || 2,
    };

    set((state) => ({
      widgets: [...state.widgets, widget],
      layout: [...state.layout, layoutItem],
    }));

    return newId;
  },

  removeWidget: (id) => {
    if (!id) return;
    set((state) => ({
      widgets: state.widgets.filter((w) => w.id !== id),
      layout: state.layout.filter((item) => item.i !== id),
    }));
  },

  updateWidgetConfig: (widgetId, newConfig) => {
    if (!widgetId || !newConfig) return;
    set((state) => ({
      widgets: state.widgets.map((w) =>
        w.id === widgetId ? { ...w, config: { ...w.config, ...newConfig } } : w,
      ),
    }));
  },

  setWidgets: (widgets) => {
    set({ widgets: Array.isArray(widgets) ? widgets : [] });
  },

  setLayout: (layout, widgets?) => {
    const validLayout = Array.isArray(layout) ? layout : [];
    const normalized = widgets ? normalizeLayoutConstraints(validLayout, widgets) : validLayout;
    set({ layout: normalized });
  },

  updateLayout: (newLayout) => {
    if (!Array.isArray(newLayout)) return;
    const { widgets, layout } = get();
    const normalized = normalizeLayoutConstraints(newLayout, widgets);
    if (JSON.stringify(normalized) !== JSON.stringify(layout)) {
      set({ layout: normalized });
    }
  },

  setFullscreenWidget: (widgetId) => {
    set({ fullscreenWidgetId: widgetId });
  },
}));
