import React, { Suspense } from 'react';
import { Alert, Box, Stack, Tab, Tabs, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useT } from '@/i18n';
import { operationRequest } from './api';
import { useAuthStore } from '@/stores/useAuthStore';
import { useSavedFilter } from '@/hooks/useSavedFilter';
import MachinePicker from '@/shared/components/MachinePicker';
const LinePanel = React.lazy(() => import('./LinePanel'));
const MaintenanceActionsPanel = React.lazy(() => import('./MaintenanceActionsPanel'));
const PlanningPanel = React.lazy(() => import('./PlanningPanel'));
const MaintenancePanel = React.lazy(() => import('./MaintenancePanel'));
const EnergyPanel = React.lazy(() => import('./EnergyPanel'));
const HistoryPanel = React.lazy(() => import('./HistoryPanel'));
const ComparisonPanel = React.lazy(() => import('./ComparisonPanel'));
const ConnectionDiagnosticsPanel = React.lazy(() => import('./ConnectionDiagnosticsPanel'));
const AlarmReviewPanel = React.lazy(() => import('./AlarmReviewPanel'));
const WorkOrderPanel = React.lazy(() => import('./WorkOrderPanel'));
const AssetOverviewPanel = React.lazy(() => import('./AssetOverviewPanel'));
const DerivedSignalsPanel = React.lazy(() => import('./DerivedSignalsPanel'));
const ChangeoverPanel = React.lazy(() => import('./ChangeoverPanel'));
const ImprovementActionsPanel = React.lazy(() => import('./ImprovementActionsPanel'));
const PlcAlarmsPanel = React.lazy(() => import('./PlcAlarmsPanel'));
/**
 *
 */
export default function OperationsPage() {
  const canSupervise = useAuthStore((s) => ['admin', 'supervisor'].includes(s.user?.role ?? ''));
  const t = useT(),
    [savedMachine, setMachine] = useSavedFilter<string>('operations:machine', ''),
    [savedTab, setTab] = useSavedFilter<number>('operations:tab', 0);
  const assets = useQuery({
    queryKey: ['production-assets'],
    queryFn: () => operationRequest<{ id: number; name: string }[]>('/production/assets'),
  });
  // A remembered machine applies only while it is still granted.
  const machine = assets.data?.some((a) => String(a.id) === savedMachine) ? savedMachine : '';
  const panels = [
    { name: 'Planning', content: <PlanningPanel machineId={Number(machine)} /> },
    { name: 'Maintenance', content: <MaintenancePanel machineId={Number(machine)} /> },
    { name: 'Energy and losses', content: <EnergyPanel machineId={Number(machine)} /> },
    { name: 'History', content: <HistoryPanel machineId={Number(machine)} /> },
    ...(canSupervise
      ? [
          { name: 'Production line', de: 'Produktionslinie', content: <LinePanel /> },
          {
            name: 'Alarm actions',
            de: 'Alarmmaßnahmen',
            content: <MaintenanceActionsPanel machineId={Number(machine)} />,
          },
          {
            name: 'Comparisons',
            de: 'Vergleiche',
            content: <ComparisonPanel machineId={Number(machine)} />,
          },
          {
            name: 'Connection diagnostics',
            de: 'Verbindungsdiagnose',
            content: <ConnectionDiagnosticsPanel machineId={Number(machine)} />,
          },
          {
            name: 'Alarm usefulness',
            de: 'Alarmbewertung',
            content: <AlarmReviewPanel machineId={Number(machine)} />,
          },
          {
            name: 'Work orders',
            de: 'Arbeitsaufträge',
            content: <WorkOrderPanel machineId={Number(machine)} />,
          },
          {
            name: 'Changeovers',
            de: 'Umrüstungen',
            content: <ChangeoverPanel machineId={Number(machine)} />,
          },
          {
            name: 'Improvement actions',
            de: 'Verbesserungsmaßnahmen',
            content: <ImprovementActionsPanel machineId={Number(machine)} />,
          },
        ]
      : []),
    {
      name: 'Asset overview',
      de: 'Anlagenübersicht',
      content: <AssetOverviewPanel machineId={Number(machine)} />,
    },
    {
      name: 'Calculated signals',
      de: 'Berechnete Signale',
      content: <DerivedSignalsPanel key={machine} machineId={Number(machine)} />,
    },
    {
      name: 'PLC alarms',
      de: 'SPS-Alarme',
      content: <PlcAlarmsPanel machineId={Number(machine)} />,
    },
  ];
  // Role changes can shorten the tab list since the tab was remembered.
  const tab = savedTab < panels.length ? savedTab : 0;
  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1250, width: '100%', mx: 'auto' }}>
      <Stack spacing={3}>
        <Typography variant="h4" component="h1">
          {t('Daily operations')}
        </Typography>
        {assets.error && <Alert severity="error">{String(assets.error)}</Alert>}
        <MachinePicker machines={assets.data} value={machine} onChange={setMachine} />
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
          {panels.map(({ name, de }, i) => (
            <Tab
              id={`operations-tab-${i}`}
              aria-controls={`operations-panel-${i}`}
              key={name}
              label={t(name, de)}
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
              {panels.at(tab)?.content}
            </Suspense>
          </Box>
        )}
      </Stack>
    </Box>
  );
}
