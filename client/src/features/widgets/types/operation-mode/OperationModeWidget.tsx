import React, { useEffect } from 'react';
import { useOperationModeData } from './useOperationModeData';
import OperationModeWidgetView from './OperationModeWidgetView';
import type { WidgetConfig } from '@/types';

interface OperationModeWidgetProps {
  config?: WidgetConfig;
  onError?: (error: Error) => void;
}

/**
 * Container component for Operation Mode Widget
 * @param root0
 * @param root0.config
 * @param root0.onError
 */
const OperationModeWidget: React.FC<OperationModeWidgetProps> = ({ config = {}, onError }) => {
  // Extract configuration values with defaults
  const { maxPoints = 120, showBrush = true, machineId } = config;

  // Use custom hook for data fetching and state management
  const { data, loading, error, lastUpdated, refresh } = useOperationModeData({
    maxPoints,
    machineId,
  });

  // Report errors to parent component if provided
  useEffect(() => {
    if (error && onError) {
      onError(new Error(`Operation Mode Widget error: ${error}`));
    }
  }, [error, onError]);

  // Simply pass all props to the view component
  return (
    <OperationModeWidgetView
      data={data}
      loading={loading}
      error={error}
      lastUpdated={lastUpdated}
      config={{ maxPoints, showBrush }}
      onRefresh={refresh}
    />
  );
};

export default OperationModeWidget;
