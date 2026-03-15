import { useState } from 'react';
import { API_ENDPOINTS } from '@/config/config';
import { useStatusStore } from '@/stores/useStatusStore';
import { useSnackbar } from 'notistack';
import api from '@/utils/api';

interface DatabaseConnectionReturn {
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  dbOnline: boolean;
  setDbOnline: React.Dispatch<React.SetStateAction<boolean>>;
  dbHost: string;
  dbPort: string;
  dbUser: string;
  dbName: string;
  handleTestDbConnection: () => Promise<void>;
}

export const useDatabaseConnection = (): DatabaseConnectionReturn => {
  const [loading, setLoading] = useState<boolean>(false);
  const [dbOnline, setDbOnline] = useState<boolean>(false);
  const { enqueueSnackbar } = useSnackbar();

  // Form states with default values
  const [dbHost] = useState<string>('localhost');
  const [dbPort] = useState<string>('5432');
  const [dbUser] = useState<string>('postgres');
  const [dbName] = useState<string>('postgres');

  const refreshStatus = useStatusStore((s) => s.refreshStatus);

  // Handle test database connection
  const handleTestDbConnection = async (): Promise<void> => {
    setLoading(true);
    try {
      await api.get(API_ENDPOINTS.dbTest);

      setDbOnline(true);
      enqueueSnackbar('Database connection successful', { variant: 'success' });
      refreshStatus();
    } catch (err) {
      console.error('Error testing database connection:', err);
      setDbOnline(false);
      enqueueSnackbar(`Database connection failed: ${(err as Error).message || 'Unknown error'}`, {
        variant: 'error',
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
    dbHost,
    dbPort,
    dbUser,
    dbName,
    handleTestDbConnection,
  };
};
