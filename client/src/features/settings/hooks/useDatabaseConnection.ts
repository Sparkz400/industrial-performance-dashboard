import { useState } from 'react';
import { API_ENDPOINTS } from '@/config/config';
import { useStatusStore } from '@/stores/useStatusStore';
import { useSnackbar } from 'notistack';
import api from '@/utils/api';

export const useDatabaseConnection = () => {
  const [loading, setLoading] = useState(false);
  const [dbOnline, setDbOnline] = useState<boolean | null>(null);
  const [testedAt, setTestedAt] = useState<Date | null>(null);
  const { enqueueSnackbar } = useSnackbar();

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
      setTestedAt(new Date());
      setLoading(false);
    }
  };

  return { loading, dbOnline, testedAt, handleTestDbConnection };
};
