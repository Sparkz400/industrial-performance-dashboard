import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@/config/config';
import protectedFetch from '@/utils/protectedFetch';
import AlertSummaryWidgetView from './AlertSummaryWidgetView';

interface AlertHistoryItem {
  id: number;
  ruleName: string;
  severity: string;
  nodeKey: string;
  triggeredAt: string;
  status: string;
}

interface AlertHistoryResponse {
  data: AlertHistoryItem[];
  total: number;
}

/**
 *
 */
function AlertSummaryWidget(): React.ReactElement {
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery<AlertHistoryResponse>({
    queryKey: ['alertSummaryWidget'],
    queryFn: async () => {
      const params = new URLSearchParams({ status: 'active', limit: '5', page: '1' });
      const res = await protectedFetch(`${API_ENDPOINTS.alerts.history}?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch alerts');
      return res.json();
    },
    refetchInterval: 30000,
  });

  const recentAlerts = data?.data ?? [];

  // Compute severity counts from recent alerts
  const severityCounts = recentAlerts.reduce(
    (acc, alert) => {
      const existing = acc.find((s) => s.severity === alert.severity);
      if (existing) {
        existing.count += 1;
      } else {
        acc.push({ severity: alert.severity, count: 1 });
      }
      return acc;
    },
    [] as { severity: string; count: number }[],
  );

  const handleViewAll = useCallback(() => {
    navigate('/alerts/history');
  }, [navigate]);

  return (
    <AlertSummaryWidgetView
      recentAlerts={recentAlerts}
      severityCounts={severityCounts}
      loading={isLoading}
      error={error ? (error as Error).message : null}
      onViewAll={handleViewAll}
    />
  );
}

export default AlertSummaryWidget;
