import { create } from 'zustand';
import type { Annotation } from '../types';
import { API_ENDPOINTS } from '../config/config';

interface AnnotationState {
  annotations: Annotation[];
  loading: boolean;
  // Actions
  loadAnnotations: (dashboardId: string) => Promise<void>;
  addAnnotation: (
    widgetId: string,
    text: string,
    timestamp: Date,
    color?: string,
    dashboardId?: string,
  ) => void;
  removeAnnotation: (id: string) => void;
  updateAnnotation: (id: string, text: string) => void;
  getAnnotationsForWidget: (widgetId: string) => Annotation[];
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  annotations: [],
  loading: false,

  loadAnnotations: async (dashboardId: string) => {
    set({ loading: true });
    try {
      const response = await fetch(
        `${API_ENDPOINTS.annotations}?dashboardId=${encodeURIComponent(dashboardId)}`,
        { credentials: 'include' },
      );
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const annotations: Annotation[] = await response.json();
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

  addAnnotation: (widgetId, text, timestamp, color = '#ff9800', dashboardId) => {
    const id = 'annotation-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const annotation: Annotation = {
      id,
      widgetId,
      dashboardId,
      text,
      timestamp,
      color,
      createdAt: new Date(),
    };

    // Optimistic update
    set((state) => ({
      annotations: [...state.annotations, annotation],
    }));

    // Persist to backend
    if (dashboardId) {
      fetch(API_ENDPOINTS.annotations, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          widgetId,
          dashboardId,
          text,
          color,
          timestamp: timestamp.toISOString(),
        }),
      }).catch((err) => {
        console.error('Error saving annotation:', err);
        // Rollback on failure
        set((state) => ({
          annotations: state.annotations.filter((a) => a.id !== id),
        }));
      });
    }
  },

  removeAnnotation: (id) => {
    const prev = get().annotations;
    set({ annotations: prev.filter((a) => a.id !== id) });

    // Delete from backend
    fetch(`${API_ENDPOINTS.annotations}/${id}`, { method: 'DELETE' }).catch((err) => {
      console.error('Error deleting annotation:', err);
      // Rollback
      set({ annotations: prev });
    });
  },

  updateAnnotation: (id, text) => {
    const prev = get().annotations;
    set({
      annotations: prev.map((a) => (a.id === id ? { ...a, text } : a)),
    });

    // Update on backend
    fetch(`${API_ENDPOINTS.annotations}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }).catch((err) => {
      console.error('Error updating annotation:', err);
      set({ annotations: prev });
    });
  },

  getAnnotationsForWidget: (widgetId) => get().annotations.filter((a) => a.widgetId === widgetId),
}));
