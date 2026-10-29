import { useState } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';

/**
 * A per-account filter remembered in this browser; storage failures fall back to the default.
 * @param name
 * @param initial
 */
export function useSavedFilter<T extends string | number>(name: string, initial: T) {
  const userId = useAuthStore((s) => s.user?.id);
  const key = `filters:${userId}:${name}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const save = (next: T) => {
    setValue(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Remembering is a convenience; the current selection still applies.
    }
  };
  return [value, save] as const;
}
