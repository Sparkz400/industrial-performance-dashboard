import { useState, useRef } from 'react';
import { useSnackbar } from 'notistack';

interface BackupRestoreReturn {
  loading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleExportDashboards: () => void;
  handleFileSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleImportClick: () => void;
}

export const useBackupRestore = (): BackupRestoreReturn => {
  const [loading, setLoading] = useState<boolean>(false);
  const { enqueueSnackbar } = useSnackbar();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Handle export dashboards
  const handleExportDashboards = (): void => {
    setLoading(true);
    try {
      const dashboardData = localStorage.getItem('dashboardData');

      if (!dashboardData) {
        enqueueSnackbar('No dashboard data to export', { variant: 'warning' });
        return;
      }

      const blob = new Blob([dashboardData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dashboard-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      enqueueSnackbar('Dashboards exported successfully', { variant: 'success' });
    } catch (err) {
      console.error('Error exporting dashboards:', err);
      enqueueSnackbar(`Export error: ${(err as Error).message}`, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Handle file selection for import
  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);

    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      try {
        if (!e.target?.result) {
          throw new Error('File could not be read');
        }
        const fileContent = typeof e.target.result === 'string' ? e.target.result : '';
        const data = JSON.parse(fileContent);

        if (!data.dashboards || !Array.isArray(data.dashboards)) {
          throw new Error('Invalid dashboard data format');
        }

        localStorage.setItem('dashboardData', fileContent);

        enqueueSnackbar(
          `Imported ${data.dashboards.length} dashboards successfully. Reload the dashboard page to see changes.`,
          { variant: 'success', persist: true },
        );
      } catch (err) {
        console.error('Error importing dashboards:', err);
        enqueueSnackbar(`Import error: ${(err as Error).message}`, { variant: 'error' });
      } finally {
        setLoading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };

    reader.onerror = () => {
      enqueueSnackbar('Error reading file', { variant: 'error' });
      setLoading(false);
    };

    reader.readAsText(file);
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
