import React, { useEffect, useCallback, useState } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';
import {
  useTwinInstance,
  type TwinNodeBinding,
} from '@/features/digital-twin/hooks/useDigitalTwinQueries';
import { useDigitalTwinLiveData } from '@/features/digital-twin/hooks/useDigitalTwinLiveData';
import SvgViewer from '@/features/digital-twin/components/SvgViewer';
import type { WidgetConfig } from '@/types';

interface DigitalTwinWidgetProps {
  config?: WidgetConfig;
  onError?: (error: Error) => void;
}

const DigitalTwinWidget: React.FC<DigitalTwinWidgetProps> = ({ config = {}, onError }) => {
  const instanceId = (config.instanceId as number) ?? 0;
  const { data: instance, isLoading, error } = useTwinInstance(instanceId);
  const liveData = useDigitalTwinLiveData(
    instance?.values ?? {},
    instance?.connection ?? 'unknown',
    !error,
  );
  const [selectedBinding, setSelectedBinding] = useState<TwinNodeBinding | null>(null);

  useEffect(() => {
    if (error && onError) {
      onError(new Error(`Digital Twin Widget error: ${error.message}`));
    }
  }, [error, onError]);

  const handleElementClick = useCallback((binding: TwinNodeBinding) => {
    setSelectedBinding(binding);
  }, []);

  if (!instanceId) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          p: 2,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Select a Digital Twin instance in widget settings
        </Typography>
      </Box>
    );
  }

  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!instance) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          p: 2,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Digital Twin instance not found.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
      <SvgViewer
        svgContent={instance.svgContent}
        bindings={instance.bindings}
        liveData={liveData}
        onElementClick={handleElementClick}
      />

      {/* Element detail dialog */}
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
              {liveData[selectedBinding.nodeKey] ? (
                <>
                  <Typography variant="h4" sx={{ my: 2 }}>
                    {typeof liveData[selectedBinding.nodeKey].value === 'number'
                      ? (liveData[selectedBinding.nodeKey].value as number).toFixed(2)
                      : liveData[selectedBinding.nodeKey].value == null
                        ? 'Unknown'
                        : String(liveData[selectedBinding.nodeKey].value)}
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

export default DigitalTwinWidget;
