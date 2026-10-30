import React, { Suspense } from 'react';
import { Alert, Box, Stack, Typography, TextField, MenuItem } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useT } from '@/i18n';
import { operationRequest } from './api';
import { useAuthStore } from '@/stores/useAuthStore';
import { useSavedFilter } from '@/hooks/useSavedFilter';
import SectionNavigation from '@/shared/components/SectionNavigation';
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
const RecommendationsPanel = React.lazy(() => import('./RecommendationsPanel'));
const CompletionForecastPanel = React.lazy(() => import('./CompletionForecastPanel'));
const PlcAlarmsPanel = React.lazy(() => import('./PlcAlarmsPanel'));
const SitesOverviewPanel = React.lazy(() => import('./SitesOverviewPanel'));
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
          {
            name: 'Recommendations',
            de: 'Empfehlungen',
            content: <RecommendationsPanel machineId={Number(machine)} />,
          },
          {
            name: 'Completion forecast',
            de: 'Fertigstellungsprognose',
            content: <CompletionForecastPanel machineId={Number(machine)} />,
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
    { name: 'Sites', de: 'Standorte', content: <SitesOverviewPanel /> },
  ];
  // Role changes can shorten the tab list since the tab was remembered.
  const tab =
    Number.isInteger(savedTab) && savedTab >= 0 && savedTab < panels.length ? savedTab : 0;
  const groups = [
    {
      label: t('Planning'),
      names: ['Planning', 'Work orders', 'Changeovers', 'Completion forecast'],
    },
    {
      label: t('Maintenance'),
      names: [
        'Maintenance',
        'Alarm actions',
        'Alarm usefulness',
        'Improvement actions',
        'Recommendations',
      ],
    },
    {
      label: t('Analysis', 'Analyse'),
      names: ['Energy and losses', 'Comparisons', 'Calculated signals'],
    },
    { label: t('History'), names: ['History'] },
    { label: t('Connections'), names: ['Connection diagnostics', 'PLC alarms'] },
    { label: t('Assets', 'Anlagen'), names: ['Production line', 'Asset overview', 'Sites'] },
  ];
  const group = groups.findIndex((item) => item.names.includes(panels.at(tab)!.name));
  const sections = panels.flatMap((panel, index) =>
    groups.at(group)!.names.includes(panel.name)
      ? [{ label: t(panel.name, panel.de), value: index }]
      : [],
  );
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
        <TextField
          select
          label={t('Work area', 'Arbeitsbereich')}
          value={group}
          onChange={(event) =>
            setTab(
              panels.findIndex((panel) =>
                groups.at(Number(event.target.value))!.names.includes(panel.name),
              ),
            )
          }
          sx={{ maxWidth: { md: 360 } }}
        >
          {groups.map((item, index) => (
            <MenuItem key={item.label} value={index}>
              {item.label}
            </MenuItem>
          ))}
        </TextField>
        <SectionNavigation
          label={t('Daily operations')}
          value={tab}
          onChange={setTab}
          sections={sections}
        />
        {/* The site overview spans machines; every other panel needs a selected machine. */}
        {(machine || panels.at(tab)?.name === 'Sites') && (
          <Box
            role="tabpanel"
            id={`operations-panel-${tab}`}
            aria-label={t(panels.at(tab)!.name, panels.at(tab)!.de)}
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
