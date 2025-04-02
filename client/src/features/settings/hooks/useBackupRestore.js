import { useState, useRef } from 'react';
import { useSnackbar } from 'notistack'; // Import useSnackbar

export const useBackupRestore = () => {
    const [backupInProgress, setBackupInProgress] = useState(false);
    // Removed alertInfo state
    const { enqueueSnackbar } = useSnackbar(); // Use the hook
    const fileInputRef = useRef(null);

    // Handle export dashboards
    const handleExportDashboards = () => {
        setBackupInProgress(true);
        try {
            const dashboardData = localStorage.getItem('dashboardData');

            if (!dashboardData) {
                // Replace setAlertInfo
                enqueueSnackbar('No dashboard data to export', { variant: 'warning' });
                setBackupInProgress(false); // Ensure progress stops
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

            // Replace setAlertInfo
            enqueueSnackbar('Dashboards exported successfully', { variant: 'success' });
        } catch (err) {
            console.error('Error exporting dashboards:', err);
            // Replace setAlertInfo
            enqueueSnackbar(`Export error: ${err.message}`, { variant: 'error' });
        } finally {
            setBackupInProgress(false);
        }
    };

    // Handle file selection for import
    const handleFileSelected = (event) => {
        const file = event.target.files?.[0]; // Use optional chaining
        if (!file) return;

        setBackupInProgress(true);

        const reader = new FileReader();
        reader.onload = (e) => {
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

                // Replace setAlertInfo
                enqueueSnackbar(`Imported ${data.dashboards.length} dashboards successfully. Reload the dashboard page to see changes.`, { variant: 'success', persist: true }); // Persist important messages
            } catch (err) {
                console.error('Error importing dashboards:', err);
                // Replace setAlertInfo
                enqueueSnackbar(`Import error: ${err.message}`, { variant: 'error' });
            } finally {
                setBackupInProgress(false);
                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
            }
        };

        reader.onerror = () => {
            // Replace setAlertInfo
            enqueueSnackbar('Error reading file', { variant: 'error' });
            setBackupInProgress(false);
        };

        reader.readAsText(file);
    };

    // Trigger file input click
    const handleImportClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    // Removed alertInfo and setAlertInfo from return
    return {
        backupInProgress,
        fileInputRef,
        handleExportDashboards,
        handleFileSelected,
        handleImportClick
    };
};