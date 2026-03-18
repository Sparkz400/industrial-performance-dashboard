import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Button,
  Stack,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate, useParams } from 'react-router-dom';
import { useTwinInstance, type TwinNodeBinding } from '../hooks/useDigitalTwinQueries';
import { useDigitalTwinLiveData } from '../hooks/useDigitalTwinLiveData';
import SvgViewer from '../components/SvgViewer';

const EMPTY_BINDINGS: TwinNodeBinding[] = [];

const DigitalTwinDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const instanceId = Number(id) || 0;

  const { data: instance, isLoading, error } = useTwinInstance(instanceId);
  const liveData = useDigitalTwinLiveData(instance?.bindings ?? EMPTY_BINDINGS);
  const [selectedBinding, setSelectedBinding] = useState<TwinNodeBinding | null>(null);

  const handleElementClick = useCallback((binding: TwinNodeBinding) => {
    setSelectedBinding(binding);
  }, []);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !instance) {
    return (
      <Box sx={{ p: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/digital-twins')}>
          Back to Digital Twins
        </Button>
        <Alert severity="error" sx={{ mt: 2 }}>
          {error ? (error as Error).message : 'Instance not found.'}
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Button
            size="small"
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/digital-twins')}
          >
            Back
          </Button>
          <Typography variant="h5" sx={{ flex: 1 }}>
            {instance.name}
          </Typography>
          <Chip label={instance.templateName || `Template #${instance.templateId}`} size="small" variant="outlined" />
          {instance.machineName && (
            <Chip label={instance.machineName} size="small" color="primary" variant="outlined" />
          )}
          <Chip
            label={`${instance.bindings?.length ?? 0} bindings`}
            size="small"
            variant="outlined"
          />
        </Stack>
      </Box>

      {/* SVG Viewer */}
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <SvgViewer
          svgContent={instance.svgContent}
          bindings={instance.bindings}
          liveData={liveData}
          onElementClick={handleElementClick}
        />
      </Box>

      {/* Element Detail Dialog */}
      <Dialog
        open={!!selectedBinding}
        onClose={() => setSelectedBinding(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{selectedBinding?.label}</DialogTitle>
        <DialogContent>
          {selectedBinding && (
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Node Key: {selectedBinding.nodeKey}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                SVG Element: {selectedBinding.elementId}
              </Typography>
              {liveData[selectedBinding.nodeKey] ? (
                <>
                  <Typography variant="h4" sx={{ my: 2 }}>
                    {typeof liveData[selectedBinding.nodeKey].value === 'number'
                      ? (liveData[selectedBinding.nodeKey].value as number).toFixed(2)
                      : liveData[selectedBinding.nodeKey].value}
                    {selectedBinding.unit && (
                      <Typography
                        component="span"
                        variant="h6"
                        color="text.secondary"
                        sx={{ ml: 1 }}
                      >
                        {selectedBinding.unit}
                      </Typography>
                    )}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Last updated:{' '}
                    {new Date(liveData[selectedBinding.nodeKey].timestamp).toLocaleString()}
                  </Typography>
                </>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  No live data available.
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedBinding(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DigitalTwinDetailPage;
