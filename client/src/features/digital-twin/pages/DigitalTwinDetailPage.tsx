import React from 'react';
import { Alert, Box, CircularProgress } from '@mui/material';
import { useParams } from 'react-router-dom';
import { useTwinInstance } from '../hooks/useDigitalTwinQueries';
import AssetOverviewPanel from '@/features/operations/AssetOverviewPanel';

/** Open the configured asset with its scoped measurements and evidence links. */
export default function DigitalTwinDetailPage() {
  const { id } = useParams<{ id: string }>();
  const instanceId = Number(id) || 0;
  const instance = useTwinInstance(instanceId);
  if (instance.isLoading) return <CircularProgress />;
  if (instance.error) return <Alert severity="error">{String(instance.error)}</Alert>;
  return (
    <Box sx={{ p: 2 }}>
      {instance.data && (
        <AssetOverviewPanel machineId={instance.data.machineId} initialInstanceId={instanceId} />
      )}
    </Box>
  );
}
