import { create } from 'zustand';
import type { Annotation } from '../types';
import { API_ENDPOINTS } from '../config/config';
import { protectedFetch } from '../utils/protectedFetch';

interface AnnotationState {
  annotations: Annotation[];
  loading: boolean;
  /** The dashboard whose annotations are loaded; new annotations are saved to it. */
  dashboardId: string | null;
  // Actions resolve to false when the server refused the change (it is rolled back).
  loadAnnotations: (dashboardId: string) => Promise<void>;
  addAnnotation: (
    widgetId: string,
    text: string,
    timestamp: Date,
    color?: string,
    dashboardId?: string,
  ) => Promise<boolean>;
  removeAnnotation: (id: string) => Promise<boolean>;
  updateAnnotation: (id: string, text: string) => Promise<boolean>;
  getAnnotationsForWidget: (widgetId: string) => Annotation[];
}

// Plain fetch carries no CSRF token, so every write was refused with 403; check ok explicitly.
const send = async (url: string, init: RequestInit) => {
  try {
    const response = await protectedFetch(url, init);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    return true;
  } catch (err) {
    console.error('Annotation change failed:', err);
    return false;
  }
};

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  annotations: [],
  loading: false,
  dashboardId: null,

  loadAnnotations: async (dashboardId: string) => {
    set({ loading: true, dashboardId, annotations: [] });
    try {
      const response = await protectedFetch(
        `${API_ENDPOINTS.annotations}?dashboardId=${encodeURIComponent(dashboardId)}`,
      );
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const annotations: Annotation[] = await response.json();
      // A newer dashboard switch wins over this slower response.
      if (get().dashboardId !== dashboardId) return;
      set({
        annotations: annotations.map((a) => ({
          ...a,
          timestamp: new Date(a.timestamp),
          createdAt: new Date(a.createdAt),
        })),
      });
    } catch (err) {
      console.error('Error loading annotations:', err);
    } finally {
      set({ loading: false });
    }
  },

  addAnnotation: async (widgetId, text, timestamp, color = '#ff9800', dashboardId) => {
    const target = dashboardId ?? get().dashboardId ?? undefined;
    const id = 'annotation-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const annotation: Annotation = {
      id,
      widgetId,
      dashboardId: target,
      text,
      timestamp,
      color,
      createdAt: new Date(),
    };

    // Optimistic update
    set((state) => ({ annotations: [...state.annotations, annotation] }));
    if (!target) return true;

    const saved = await send(API_ENDPOINTS.annotations, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        widgetId,
        dashboardId: target,
        text,
        color,
        timestamp: timestamp.toISOString(),
      }),
    });
    if (!saved) set((state) => ({ annotations: state.annotations.filter((a) => a.id !== id) }));
    return saved;
  },

  removeAnnotation: async (id) => {
    const prev = get().annotations;
    set({ annotations: prev.filter((a) => a.id !== id) });
    const deleted = await send(`${API_ENDPOINTS.annotations}/${id}`, { method: 'DELETE' });
    if (!deleted) set({ annotations: prev });
    return deleted;
  },

  updateAnnotation: async (id, text) => {
    const prev = get().annotations;
    set({ annotations: prev.map((a) => (a.id === id ? { ...a, text } : a)) });
    const updated = await send(`${API_ENDPOINTS.annotations}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!updated) set({ annotations: prev });
    return updated;
  },

  getAnnotationsForWidget: (widgetId) => get().annotations.filter((a) => a.widgetId === widgetId),
}));
