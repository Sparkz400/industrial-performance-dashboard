import React from 'react';
import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  List,
  ListItemButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { MachineLiveSummary, ShiftReport } from '@performance-dashboard/shared';
import { formatNumber, useT } from '@/i18n';
import PageHeader from '@/shared/components/PageHeader';
import { useAuthStore } from '@/stores/useAuthStore';
import { productionRequest } from './productionApi';
import { displayedState } from './displayedState';
import ShiftTimeline from './ShiftTimeline';
import KpiSummaryBar from '../dashboard/components/KpiSummaryBar';

/**
 *
 */
export default function OverviewPage() {
  const t = useT();
  const admin = useAuthStore((state) => state.user?.role === 'admin');
  const [search, setSearch] = useState(''),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState<number>();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const assets = useQuery({
    queryKey: ['production-assets'],
    queryFn: () => productionRequest<{ id: number; name: string }[]>('/assets'),
  });
  const filtered = (assets.data ?? []).filter((asset) =>
    asset.name.toLowerCase().includes(search.toLowerCase()),
  );
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 6) - 1));
  const visible = filtered.slice(currentPage * 6, currentPage * 6 + 6);
  const ids = visible.map((asset) => asset.id).join(',');
  const live = useQuery({
    queryKey: ['overview-live', ids],
    queryFn: () =>
      productionRequest<{ checkedAt: string; machines: MachineLiveSummary[] }>(
        `/operator/live?ids=${ids}`,
      ),
    enabled: !!ids,
    refetchInterval: 5000,
    retry: 1,
  });
  const stale = !live.data || now - live.dataUpdatedAt > 15000 || !!live.error;
  const machine =
    live.data?.machines.find((item) => item.id === (selected ?? visible[0]?.id)) ??
    live.data?.machines[0];
  const report = useQuery({
    queryKey: ['shift-report', String(machine?.shift?.id ?? '')],
    queryFn: () => productionRequest<ShiftReport>(`/shifts/${machine!.shift!.id}/report`),
    enabled: !!machine?.shift,
    refetchInterval: 5000,
  });
  return (
    <Box>
      {admin && <KpiSummaryBar />}
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1600, mx: 'auto' }}>
        <PageHeader
          title={t('Shift overview', 'Schichtübersicht')}
          description={t(
            'Machine state, observed production and open handover items.',
            'Maschinenzustand, beobachtete Produktion und offene Übergaben.',
          )}
          actions={
            <Button component={Link} to="/dashboards">
              {t('Custom dashboards', 'Eigene Dashboards')}
            </Button>
          }
        />
        {(assets.error || live.error) && (
          <Alert
            severity="error"
            action={
              <Button
                onClick={() => {
                  void assets.refetch();
                  void live.refetch();
                }}
              >
                {t('Retry')}
              </Button>
            }
            sx={{ mb: 2 }}
          >
            {t(
              'Live status unavailable. Last observations are retained; current state is unknown.',
              'Live-Status nicht verfügbar. Letzte Beobachtungen bleiben sichtbar; der aktuelle Zustand ist unbekannt.',
            )}
          </Alert>
        )}
        <TextField
          fullWidth
          label={t('Search machines', 'Maschinen suchen')}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
          sx={{ mb: 2, maxWidth: 520 }}
        />
        {assets.isLoading && <Typography role="status">{t('Loading…')}</Typography>}
        {!assets.isLoading && !assets.error && !visible.length && (
          <Alert severity="info">
            {t('No machines match this view.', 'Keine Maschinen in dieser Ansicht.')}
            {admin && (
              <Button component={Link} to="/machines">
                {t('Manage machines', 'Maschinen verwalten')}
              </Button>
            )}
          </Alert>
        )}
        {!!visible.length && (
          <Box
            sx={{
              display: 'grid',
              alignItems: 'start',
              gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 3fr) minmax(0, 2fr)' },
              gap: 2,
            }}
          >
            <Paper variant="outlined" sx={{ minWidth: 0 }}>
              <Typography variant="h6" sx={{ p: 2 }}>
                {t('Machines')} · {visible.length} / {filtered.length}
              </Typography>
              <List disablePadding aria-label={t('Machines')}>
                {visible.map((asset) => {
                  const observation = live.data?.machines.find((item) => item.id === asset.id);
                  const state = observation
                    ? displayedState(observation, live.dataUpdatedAt, now, !!live.error)
                    : 'unknown';
                  return (
                    <ListItemButton
                      key={asset.id}
                      selected={machine?.id === asset.id}
                      onClick={() => setSelected(asset.id)}
                      aria-label={asset.name}
                      sx={{ display: 'block', p: 2, borderTop: 1, borderColor: 'divider' }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 1,
                          justifyContent: 'space-between',
                          mb: 1,
                        }}
                      >
                        <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                          {asset.name}
                        </Typography>
                        <Chip
                          size="small"
                          variant="outlined"
                          label={t(state)}
                          color={
                            state === 'running'
                              ? 'success'
                              : state === 'fault'
                                ? 'error'
                                : state === 'unknown'
                                  ? 'default'
                                  : state === 'planned'
                                    ? 'info'
                                    : 'warning'
                          }
                        />
                      </Box>
                      <Typography variant="body2">
                        {t('Observed production', 'Beobachtete Produktion')}:{' '}
                        {formatNumber(observation?.production.observed ?? null)}
                        {observation?.production.complete === false
                          ? ` · ${t('Partial history', 'Unvollständige Historie')}`
                          : ''}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t('Last measurement', 'Letzte Messung')}:{' '}
                        {observation?.lastMeasurement
                          ? new Date(observation.lastMeasurement).toLocaleString()
                          : t('Unknown')}{' '}
                        · {t(observation?.freshness ?? 'missing')}
                      </Typography>
                    </ListItemButton>
                  );
                })}
              </List>
              {filtered.length > 6 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1 }}>
                  <Button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                    {t('Previous')}
                  </Button>
                  <Button
                    disabled={(currentPage + 1) * 6 >= filtered.length}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    {t('Next')}
                  </Button>
                </Box>
              )}
            </Paper>
            <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }}>
              {machine ? (
                <Stack spacing={2}>
                  <Typography variant="h6">{machine.name}</Typography>
                  {stale && (
                    <Alert severity="info">
                      {t(
                        'Current machine state is unknown.',
                        'Der aktuelle Maschinenzustand ist unbekannt.',
                      )}
                    </Alert>
                  )}
                  {report.error && (
                    <Alert
                      severity="error"
                      action={<Button onClick={() => void report.refetch()}>{t('Retry')}</Button>}
                    >
                      {t(
                        'Shift report could not be refreshed.',
                        'Schichtbericht konnte nicht aktualisiert werden.',
                      )}
                    </Alert>
                  )}
                  {report.isLoading && <Typography role="status">{t('Loading…')}</Typography>}
                  {report.data && (
                    <>
                      <ShiftTimeline report={report.data} />
                      <Typography variant="caption" color="text.secondary">
                        {t('Report generated', 'Bericht erstellt')}:{' '}
                        {new Date(report.data.generatedAt).toLocaleString()}
                      </Typography>
                    </>
                  )}
                  {!machine.shift && (
                    <Typography>
                      {t('No current shift is configured.', 'Keine aktuelle Schicht eingerichtet.')}
                    </Typography>
                  )}
                  <Typography variant="h6">{t('Open handover items')}</Typography>
                  {machine.issues.length ? (
                    <Box component="ul" sx={{ pl: 2, m: 0 }}>
                      {machine.issues.map((issue) => (
                        <li key={issue.id}>
                          <Typography>{issue.text}</Typography>
                        </li>
                      ))}
                    </Box>
                  ) : (
                    <Typography color="text.secondary">
                      {t('No open handover items for this shift.')}
                    </Typography>
                  )}
                  <Button
                    component={Link}
                    to={machine.shift ? `/production?shift=${machine.shift.id}` : '/production'}
                    variant="outlined"
                  >
                    {t('Open shift workspace', 'Schichtarbeitsplatz öffnen')}
                  </Button>
                </Stack>
              ) : (
                <Typography role="status">{t('Loading…')}</Typography>
              )}
            </Paper>
          </Box>
        )}
      </Box>
    </Box>
  );
}
