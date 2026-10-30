import React, { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useTrendingData } from './useTrendingData';
import TrendingExplorerWidgetView from './TrendingExplorerWidgetView';
import TagSelector from './components/TagSelector';
import ExportButton from './components/ExportButton';
import { useTimeRangeStore } from '@/stores/useTimeRangeStore';
import type { WidgetConfig } from '@/types';

interface TrendingExplorerWidgetProps {
  config?: WidgetConfig;
  onError?: (error: Error) => void;
}

/**
 * Container component for Trending Explorer Widget
 * @param root0
 * @param root0.config
 * @param root0.onError
 */
const TrendingExplorerWidget: React.FC<TrendingExplorerWidgetProps> = ({
  config = {},
  onError,
}) => {
  const machineId = (config.machineId as number) ?? null;
  const defaultTags = (config.defaultTags as string[]) ?? [];
  const timeRange = useTimeRangeStore((s) => s.timeRange);

  const [selectedTags, setSelectedTags] = useState<string[]>(defaultTags);

  // Sync with config when it changes
  const defaultTagsSerialized = JSON.stringify(defaultTags);
  useEffect(() => {
    setSelectedTags(JSON.parse(defaultTagsSerialized) as string[]);
  }, [defaultTagsSerialized]);

  const startDate = timeRange.start?.toISOString() ?? '';
  const endDate = timeRange.end?.toISOString() ?? '';

  const { data, isLoading, error } = useTrendingData({
    nodeKeys: selectedTags,
    machineId: machineId ?? undefined,
    startDate,
    endDate,
  });

  useEffect(() => {
    if (error && onError) {
      onError(new Error(`Trending Explorer Widget error: ${error.message}`));
    }
  }, [error, onError]);

  if (!machineId) {
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
        <Typography
          variant="body2"
          sx={{
            color: 'text.secondary',
          }}
        >
          Select a machine in widget settings
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', p: 1 }}>
      {/* Toolbar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap',
          mb: 1,
        }}
        className="no-drag"
      >
        <Box sx={{ flexGrow: 1, minWidth: 200 }}>
          <TagSelector
            machineId={machineId}
            selectedTags={selectedTags}
            onTagsChange={setSelectedTags}
          />
        </Box>
        <ExportButton
          nodeKeys={selectedTags}
          machineId={machineId}
          startDate={startDate}
          endDate={endDate}
        />
      </Box>

      {/* Chart */}
      <Box sx={{ flexGrow: 1, minHeight: 0 }}>
        <TrendingExplorerWidgetView series={data ?? []} isLoading={isLoading} />
      </Box>
    </Box>
  );
};

export default TrendingExplorerWidget;
