import React from 'react';
import { Box, Chip, Typography } from '@mui/material';
import { ButtonLoader } from '@/shared/components/loading/index';
import { useT } from '@/i18n';

/**
 *
 * @param root0
 * @param root0.dbOnline
 * @param root0.testedAt
 * @param root0.handleTestDbConnection
 * @param root0.loading
 */
export default function DatabaseConnectionCard({
  dbOnline,
  testedAt,
  handleTestDbConnection,
  loading,
}: {
  dbOnline: boolean | null;
  testedAt: Date | null;
  handleTestDbConnection: () => void;
  loading: boolean;
}) {
  const t = useT();
  return (
    <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: '7px' }}>
      <Typography variant="h6" sx={{ mb: 1 }}>
        {t('Application database test', 'Test der Anwendungsdatenbank')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {t(
          'Tests the database configured on this server. Connection settings are managed by the installation configuration.',
          'Testet die auf diesem Server konfigurierte Datenbank. Verbindungsdaten werden in der Installationskonfiguration verwaltet.',
        )}
      </Typography>
      <Chip
        variant="outlined"
        size="small"
        label={t(
          dbOnline === null ? 'Not tested' : dbOnline ? 'Last test passed' : 'Last test failed',
        )}
        color={dbOnline === null ? 'default' : dbOnline ? 'success' : 'error'}
      />
      {testedAt && (
        <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
          {testedAt.toLocaleString()}
        </Typography>
      )}
      <Box sx={{ mt: 2 }}>
        <ButtonLoader variant="outlined" onClick={handleTestDbConnection} loading={loading}>
          {t('Test Connection')}
        </ButtonLoader>
      </Box>
    </Box>
  );
}
