import { useState } from 'react';
import { API_ENDPOINTS } from '../../../config/config.js';
import { useSystemStatus } from '../../system/index.jsx';

export const useDatabaseConnection = () => {
    const [loading, setLoading] = useState(false);
    const [dbOnline, setDbOnline] = useState(false);
    const [alertInfo, setAlertInfo] = useState({ open: false, message: '', severity: 'info' });

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
                setAlertInfo({
                    open: true,
                    message: 'Database connection successful',
                    severity: 'success'
                });
                refreshStatus();
            } else {
                setDbOnline(false);
                setAlertInfo({
                    open: true,
                    message: `Database connection failed: ${data.error || 'Unknown error'}`,
                    severity: 'error'
                });
            }
        } catch (err) {
            console.error('Error testing database connection:', err);
            setDbOnline(false);
            setAlertInfo({
                open: true,
                message: `Database error: ${err.message}`,
                severity: 'error'
            });
        } finally {
            setLoading(false);
        }
    };

    return {
        loading,
        setLoading,
        dbOnline,
        setDbOnline,
        alertInfo,
        setAlertInfo,
        dbHost,
        dbPort,
        dbUser,
        dbName,
        handleTestDbConnection
    };
};
