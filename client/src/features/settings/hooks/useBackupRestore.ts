import { useState, useRef } from 'react';
import { useSnackbar } from 'notistack';
import api from '@/utils/api';
import { API_ENDPOINTS } from '@/config/config';
import type { Dashboard } from '@/types';

interface BackupRestoreReturn {
  loading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleExportDashboards: () => Promise<void>;
  handleFileSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleImportClick: () => void;
}

export const useBackupRestore = (): BackupRestoreReturn => {
  const [loading, setLoading] = useState<boolean>(false);
  const { enqueueSnackbar } = useSnackbar();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Dashboards live on the server (the old localStorage key was never written), so export
  // and import go through the dashboard API. Imports become new copies and never overwrite.
  const handleExportDashboards = async (): Promise<void> => {
    setLoading(true);
    try {
      const dashboards = (await api.endpoints.getDashboards()) as Dashboard[];
      if (!dashboards.length) {
        enqueueSnackbar('No dashboard data to export', { variant: 'warning' });
        return;
      }
      const blob = new Blob([JSON.stringify({ dashboards }, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dashboard-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      enqueueSnackbar(`Exported ${dashboards.length} dashboards`, { variant: 'success' });
    } catch (err) {
      console.error('Error exporting dashboards:', err);
      enqueueSnackbar(`Export error: ${(err as Error).message}`, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const importDashboards = async (fileContent: string): Promise<void> => {
    const data = JSON.parse(fileContent);
    if (!data.dashboards || !Array.isArray(data.dashboards)) {
      throw new Error('Invalid dashboard data format');
    }
    let imported = 0;
    for (const dashboard of data.dashboards as Dashboard[]) {
      await api.post(`${API_ENDPOINTS.dashboards}/import`, {
        name: dashboard.name,
        widgets: dashboard.widgets ?? [],
        layout: dashboard.layout ?? [],
      });
      imported++;
    }
    enqueueSnackbar(`Imported ${imported} dashboards as new copies`, { variant: 'success' });
  };

  // Handle file selection for import
  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    file
      .text()
      .then(importDashboards)
      .catch((err: Error) => {
        console.error('Error importing dashboards:', err);
        enqueueSnackbar(`Import error: ${err.message}`, { variant: 'error' });
      })
      .finally(() => {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      });
  };

  // Trigger file input click
  const handleImportClick = (): void => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return {
    loading,
    fileInputRef,
    handleExportDashboards,
    handleFileSelected,
    handleImportClick,
  };
};
