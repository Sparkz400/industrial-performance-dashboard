import { useState, useRef } from 'react';

export const useBackupRestore = () => {
    const [backupInProgress, setBackupInProgress] = useState(false);
    const [alertInfo, setAlertInfo] = useState({ open: false, message: '', severity: 'info' });
    const fileInputRef = useRef(null);

    // Handle export dashboards
    const handleExportDashboards = () => {
        setBackupInProgress(true);
        try {
            // Get dashboard data from localStorage
            const dashboardData = localStorage.getItem('dashboardData');

            if (!dashboardData) {
                setAlertInfo({
                    open: true,
                    message: 'No dashboard data to export',
                    severity: 'warning'
                });
                return;
            }

            // Create a JSON blob and download
            const blob = new Blob([dashboardData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `dashboard-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            setAlertInfo({
                open: true,
                message: 'Dashboards exported successfully',
                severity: 'success'
            });
        } catch (err) {
            console.error('Error exporting dashboards:', err);
            setAlertInfo({
                open: true,
                message: `Export error: ${err.message}`,
                severity: 'error'
            });
        } finally {
            setBackupInProgress(false);
        }
    };

    // Handle file selection for import
    const handleFileSelected = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setBackupInProgress(true);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);

                // Validate data structure
                if (!data.dashboards || !Array.isArray(data.dashboards)) {
                    throw new Error('Invalid dashboard data format');
                }

                // Save to localStorage
                localStorage.setItem('dashboardData', e.target.result);

                setAlertInfo({
                    open: true,
                    message: `Imported ${data.dashboards.length} dashboards successfully. Reload the dashboard page to see changes.`,
                    severity: 'success'
                });
            } catch (err) {
                console.error('Error importing dashboards:', err);
                setAlertInfo({
                    open: true,
                    message: `Import error: ${err.message}`,
                    severity: 'error'
                });
            } finally {
                setBackupInProgress(false);
                // Reset file input
                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
            }
        };

        reader.onerror = () => {
            setAlertInfo({
                open: true,
                message: 'Error reading file',
                severity: 'error'
            });
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

    return {
        backupInProgress,
        alertInfo,
        setAlertInfo,
        fileInputRef,
        handleExportDashboards,
        handleFileSelected,
        handleImportClick
    };
};