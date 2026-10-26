import React, { useState, Suspense } from 'react';
import { Alert, Box, MenuItem, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useT } from '@/i18n';
import { operationRequest } from './api';
import { useAuthStore } from '@/stores/useAuthStore';
const LinePanel = React.lazy(() => import('./LinePanel'));
const MaintenanceActionsPanel = React.lazy(() => import('./MaintenanceActionsPanel'));
const PlanningPanel = React.lazy(() => import('./PlanningPanel'));
const MaintenancePanel = React.lazy(() => import('./MaintenancePanel'));
const EnergyPanel = React.lazy(() => import('./EnergyPanel'));
const HistoryPanel = React.lazy(() => import('./HistoryPanel'));
/**
 *
 */
export default function OperationsPage() {
  const admin = useAuthStore((s) => s.user?.role === 'admin');
  const t = useT(),
    [machine, setMachine] = useState(''),
    [tab, setTab] = useState(0);
  const assets = useQuery({
    queryKey: ['production-assets'],
    queryFn: () => operationRequest<{ id: number; name: string }[]>('/production/assets'),
  });
  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1250, width: '100%', mx: 'auto' }}>
      <Stack spacing={3}>
        <Typography variant="h4" component="h1">
          {t('Daily operations')}
        </Typography>
        {assets.error && <Alert severity="error">{String(assets.error)}</Alert>}
        <TextField
          select
          label={t('Machine')}
          value={machine}
          onChange={(e) => setMachine(e.target.value)}
        >
          {assets.data?.map((a) => (
            <MenuItem key={a.id} value={a.id}>
              {a.name}
            </MenuItem>
          ))}
        </TextField>
        {!assets.isLoading && !assets.data?.length && (
          <Alert severity="info">
            {t(
              'No machines assigned. Ask an administrator for access.',
              'Keine Maschinen zugewiesen. Bitte die Administration um Zugriff bitten.',
            )}
          </Alert>
        )}
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          aria-label={t('Daily operations')}
        >
          {[
            'Planning',
            'Maintenance',
            'Energy and losses',
            'History',
            ...(admin ? ['Production line', 'Alarm actions'] : []),
          ].map((name, i) => (
            <Tab
              id={`operations-tab-${i}`}
              aria-controls={`operations-panel-${i}`}
              key={name}
              label={t(name)}
            />
          ))}
        </Tabs>
        {machine && (
          <Box
            role="tabpanel"
            id={`operations-panel-${tab}`}
            aria-labelledby={`operations-tab-${tab}`}
            key={`${machine}:${tab}`}
          >
            <Suspense fallback={<Typography role="status">{t('Loading…')}</Typography>}>
              {tab === 0 ? (
                <PlanningPanel machineId={Number(machine)} />
              ) : tab === 1 ? (
                <MaintenancePanel machineId={Number(machine)} />
              ) : tab === 2 ? (
                <EnergyPanel machineId={Number(machine)} />
              ) : tab === 3 ? (
                <HistoryPanel machineId={Number(machine)} />
              ) : tab === 4 ? (
                <LinePanel />
              ) : (
                <MaintenanceActionsPanel machineId={Number(machine)} />
              )}
            </Suspense>
          </Box>
        )}
      </Stack>
    </Box>
  );
}
