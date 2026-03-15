import { create } from 'zustand';
import type { Annotation } from '../types';

interface AnnotationState {
  annotations: Annotation[];
  // Actions
  addAnnotation: (widgetId: string, text: string, timestamp: Date, color?: string) => void;
  removeAnnotation: (id: string) => void;
  updateAnnotation: (id: string, text: string) => void;
  getAnnotationsForWidget: (widgetId: string) => Annotation[];
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  annotations: [],

  addAnnotation: (widgetId, text, timestamp, color = '#ff9800') => {
    const annotation: Annotation = {
      id: 'annotation-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      widgetId,
      text,
      timestamp,
      color,
      createdAt: new Date(),
    };
    set((state) => ({
      annotations: [...state.annotations, annotation],
    }));
  },

  removeAnnotation: (id) => {
    set((state) => ({
      annotations: state.annotations.filter((a) => a.id !== id),
    }));
  },

  updateAnnotation: (id, text) => {
    set((state) => ({
      annotations: state.annotations.map((a) => (a.id === id ? { ...a, text } : a)),
    }));
  },

  getAnnotationsForWidget: (widgetId) => get().annotations.filter((a) => a.widgetId === widgetId),
}));
