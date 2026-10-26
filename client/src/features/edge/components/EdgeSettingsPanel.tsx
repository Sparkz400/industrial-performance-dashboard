import React from 'react';
import { Alert, Paper, Typography } from '@mui/material';
import { useEdgeStatus } from '../hooks/useEdgeQueries';

const EdgeSettingsPanel: React.FC = () => {
  const { data: status, error } = useEdgeStatus();
  return (
    <Paper sx={{ p: 3, maxWidth: 600 }}>
      <Typography variant="h6" gutterBottom>
        Edge Gateway Settings
      </Typography>
      <Alert severity="warning">
        Edge synchronization is disabled. Central history ingestion is not implemented. Previously
        transferred records are not proof of queryable central measurements. Existing queue records
        are retained; local measurement collection continues independently.
      </Alert>
      {error && <Alert severity="error">Could not read the retained queue status.</Alert>}
      {status && (
        <Typography sx={{ mt: 2 }}>
          Retained pending records: {status.pendingRecords}. Previously marked transferred:{' '}
          {status.legacyTransferredRecords ?? 0}.
        </Typography>
      )}
    </Paper>
  );
};
export default EdgeSettingsPanel;
