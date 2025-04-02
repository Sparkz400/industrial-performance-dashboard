// ===== ..\client\src\features\settings\hooks\useDatabaseConnection.js =====
import { useState } from 'react';
import { API_ENDPOINTS } from '../../../config/config.js';
import { useSystemStatus } from '../../system/index.jsx';
import { useSnackbar } from 'notistack'; // Import useSnackbar

export const useDatabaseConnection = () => {
    const [loading, setLoading] = useState(false);
    const [dbOnline, setDbOnline] = useState(false);
    // Removed alertInfo state
    const { enqueueSnackbar } = useSnackbar(); // Use the hook

    // Form states with default values
    const [dbHost, setDbHost] = useState('localhost');
    const [dbPort, setDbPort] = useState('5432');
    const [dbUser, setDbUser] = useState('postgres');
    const [dbName, setDbName] = useState('postgres');

    const { refreshStatus } = useSystemStatus();

    // Handle test database connection
    const handleTestDbConnection = async () => {
        setLoading(true);
        try {
            const res = await fetch(API_ENDPOINTS.dbTest);
            const data = await res.json();

            if (res.ok) {
                setDbOnline(true);
                // Replace setAlertInfo
                enqueueSnackbar('Database connection successful', { variant: 'success' });
                refreshStatus(); // Refresh overall system status
            } else {
                setDbOnline(false);
                // Replace setAlertInfo
                enqueueSnackbar(`Database connection failed: ${data.error || 'Unknown error'}`, { variant: 'error' });
            }
        } catch (err) {
            console.error('Error testing database connection:', err);
            setDbOnline(false);
            // Replace setAlertInfo
            enqueueSnackbar(`Database error: ${err.message}`, { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    // Removed alertInfo and setAlertInfo from return
    return {
        loading,
        setLoading,
        dbOnline,
        setDbOnline,
        dbHost,
        dbPort,
        dbUser,
        dbName,
        handleTestDbConnection
    };
};