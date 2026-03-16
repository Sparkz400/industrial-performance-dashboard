import { useEffect, useState } from 'react';
import { api } from '@/utils/api';
import type { CustomWidgetRegistration, CustomWidgetManifest } from '@/types';

/**
 *
 */
export function useCustomWidgets() {
  const [customWidgets, setCustomWidgets] = useState<CustomWidgetRegistration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    /**
     *
     */
    async function load() {
      try {
        const data = (await api.endpoints.getCustomWidgets()) as CustomWidgetRegistration[];
        if (!cancelled) {
          setCustomWidgets(data.filter((w) => w.isActive));
        }
      } catch {
        // Silently fail — custom widgets are optional
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { customWidgets, loading };
}

/**
 *
 * @param widget
 */
export function getManifest(widget: CustomWidgetRegistration): CustomWidgetManifest {
  return widget.manifest as CustomWidgetManifest;
}
