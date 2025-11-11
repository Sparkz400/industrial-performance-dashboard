// ===== ..\client\src\features\settings\hooks\useDatabaseConnection.js =====
import { useState } from 'react';
import { API_ENDPOINTS } from '../../../config/config.js';
import { useSystemStatus } from '../../system/index.jsx';
import { useSnackbar } from 'notistack';
import api from "../../../utils/api.js"; // Import useSnackbar

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
            const data = await api.get(API_ENDPOINTS.dbTest);

            setDbOnline(true);
            enqueueSnackbar('Database connection successful', { variant: 'success' });
            refreshStatus();
        } catch (err) { // api.get throws on error
            console.error('Error testing database connection:', err);
            setDbOnline(false);
            enqueueSnackbar(`Database connection failed: ${err.message || 'Unknown error'}`, { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

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