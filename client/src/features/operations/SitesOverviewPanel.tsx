import React from 'react';
import { Alert, Box, Chip, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useLanguage, useT } from '@/i18n';
import { operationRequest } from './api';

interface Site {
  id: number;
  name: string;
  site: string;
  availability: 'online' | 'offline' | 'never connected' | 'not enrolled' | 'revoked';
  lastContactAt: string | null;
  lastSuccessfulSyncAt: string | null;
  newestReadingAt: string | null;
  backlogAtLastContact: number | null;
  machines: {
    id: number;
    name: string;
    definitionDigest: string | null;
    newestReadingAt: string | null;
  }[];
}

/**
 * E03: each edge site's availability and data coverage. A site that is not online shows when
 * its data ends, never zero production or current values.
 */
export default function SitesOverviewPanel() {
  const t = useT(),
    language = useLanguage((s) => s.language);
  const sites = useQuery({
    queryKey: ['sites-overview'],
    queryFn: () => operationRequest<Site[]>('/edges/overview'),
    refetchInterval: 15_000,
  });
  const when = (value: string | null) =>
    value ? new Date(value).toLocaleString(language) : t('never', 'nie');
  // Machines that share a production definition across sites are comparable.
  const shared = new Map<string, number>();
  for (const site of sites.data ?? [])
    for (const machine of site.machines)
      if (machine.definitionDigest)
        shared.set(machine.definitionDigest, (shared.get(machine.definitionDigest) ?? 0) + 1);
  const label: Record<Site['availability'], string> = {
    online: t('online', 'online'),
    offline: t('offline', 'offline'),
    'never connected': t('never connected', 'nie verbunden'),
    'not enrolled': t('not enrolled', 'nicht registriert'),
    revoked: t('revoked', 'widerrufen'),
  };
  return (
    <Stack spacing={2} sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <Typography variant="h5">{t('Sites', 'Standorte')}</Typography>
      <Alert severity="info">
        {t(
          'Edge sites send their stored measurements here. Data from a site ends where its last confirmed batch ends; an offline site keeps collecting locally and its gap is unknown here until it reconnects, never zero.',
          'Edge-Standorte senden ihre gespeicherten Messwerte hierher. Die Daten eines Standorts enden mit seinem letzten bestätigten Paket; ein Standort offline sammelt lokal weiter, und seine Lücke ist hier bis zur Wiederverbindung unbekannt, nie null.',
        )}
      </Alert>
      {sites.error && <Alert severity="error">{String(sites.error)}</Alert>}
      {sites.data && !sites.data.length && (
        <Typography>
          {t('No edge sites are visible to you.', 'Keine Edge-Standorte für Sie sichtbar.')}
        </Typography>
      )}
      {sites.data?.map((site) => (
        <Box
          key={site.id}
          component="section"
          aria-label={`${site.site} · ${site.name}`}
          sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}
        >
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: 'center',
              mb: 1,
            }}
          >
            <Typography variant="h6" component="h3">
              {site.site} · {site.name}
            </Typography>
            <Chip
              size="small"
              color={site.availability === 'online' ? 'success' : 'warning'}
              label={label[site.availability]}
            />
          </Stack>
          <Typography variant="body2">
            {t('Last contact', 'Letzter Kontakt')}: {when(site.lastContactAt)} ·{' '}
            {t('last confirmed batch', 'letztes bestätigtes Paket')}:{' '}
            {when(site.lastSuccessfulSyncAt)} · {t('data until', 'Daten bis')}:{' '}
            {when(site.newestReadingAt)} · {t('waiting at the site', 'wartend am Standort')}:{' '}
            {site.backlogAtLastContact ?? '–'}
          </Typography>
          {site.availability !== 'online' && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              {t(
                'Not current: values after the time above are unknown here, not zero.',
                'Nicht aktuell: Werte nach dem obigen Zeitpunkt sind hier unbekannt, nicht null.',
              )}
            </Alert>
          )}
          {site.machines.map((machine) => (
            <Typography key={machine.id} variant="body2" sx={{ mt: 0.5 }}>
              {machine.name} · {t('data until', 'Daten bis')} {when(machine.newestReadingAt)} ·{' '}
              {machine.definitionDigest
                ? `${t('definition', 'Definition')} ${machine.definitionDigest.slice(0, 8)} (${
                    (shared.get(machine.definitionDigest) ?? 1) > 1
                      ? t(
                          'shared with other machines, comparable',
                          'mit anderen Maschinen geteilt, vergleichbar',
                        )
                      : t('used only here', 'nur hier verwendet')
                  })`
                : t('no production definition', 'keine Produktionsdefinition')}
            </Typography>
          ))}
        </Box>
      ))}
    </Stack>
  );
}
