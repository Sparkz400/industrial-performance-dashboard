import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Box, CircularProgress, Paper, Typography } from '@mui/material';
import type { PublicSharedData, PublicSharedView } from '@performance-dashboard/shared';
import { API_ENDPOINTS } from '@/config/config';
import TrendingExplorerWidgetView from '../../widgets/types/trending-explorer/TrendingExplorerWidgetView';
import { toChartSeries } from '../../widgets/types/trending-explorer/useTrendingData';
import type { TrendingSeries } from '../../widgets/types/trending-explorer/useTrendingData';

interface EmbedPageProps {
  mode: 'shared' | 'embed';
}

class GoneError extends Error {}

/**
 * Public reads never send the viewer's session cookie.
 * @param url
 */
async function publicGet<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    credentials: 'omit',
    headers: { Accept: 'application/json' },
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 410 || response.status === 404) throw new GoneError(body.error);
  if (!response.ok) throw new Error(body.error || `HTTP Error: ${response.status}`);
  return body as T;
}

/**
 * Read-only view of the trend widgets selected for a link. Each refresh re-checks the link,
 * so expiry or revocation stops further data and clears what was shown.
 * @param root0
 * @param root0.mode
 */
export default function EmbedPage({ mode }: EmbedPageProps) {
  const { token = '' } = useParams<{ token: string }>();
  const [view, setView] = useState<PublicSharedView | null>(null);
  const [series, setSeries] = useState<Record<string, TrendingSeries[]>>({});
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const current = await publicGet<PublicSharedView>(API_ENDPOINTS.share.public(token));
        const results = await Promise.all(
          current.widgets.map(async (widget) => ({
            id: widget.id,
            data: await publicGet<PublicSharedData>(
              API_ENDPOINTS.share.publicData(token, widget.id),
            ),
          })),
        );
        if (stopped) return;
        setView(current);
        setSeries(Object.fromEntries(results.map(({ id, data }) => [id, toChartSeries(data)])));
        setUpdatedAt(results[0]?.data.generatedAt ?? new Date().toISOString());
        setError(null);
        timer = setTimeout(refresh, current.refreshSeconds * 1000);
      } catch (err) {
        if (stopped) return;
        if (err instanceof GoneError) {
          setGone(true);
          setView(null);
          setSeries({});
          return;
        }
        setError((err as Error).message);
        timer = setTimeout(refresh, 30_000);
      }
    };
    void refresh();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [token]);

  if (gone) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100vh', p: 2 }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h4" component="h1">
            This shared view is unavailable
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
            }}
          >
            The link may have expired or been revoked. Ask the person who shared it for a new one.
          </Typography>
        </Box>
      </Box>
    );
  }

  if (!view) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100vh', p: 2 }}>
        {error ? (
          <Alert severity="error">{error}</Alert>
        ) : (
          <CircularProgress aria-label="Loading" />
        )}
      </Box>
    );
  }

  const isEmbed = mode === 'embed';
  return (
    <Box
      component="main"
      sx={{ minHeight: '100vh', bgcolor: 'background.default', p: isEmbed ? 1 : 2 }}
    >
      {!isEmbed && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="h4" component="h1">
            {view.label || 'Shared trends'}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
            }}
          >
            Read-only · last {view.windowHours} h · link expires{' '}
            {new Date(view.expiresAt).toLocaleString()}
          </Typography>
        </Box>
      )}
      <Typography
        variant="caption"
        role="status"
        sx={{
          color: 'text.secondary',
        }}
      >
        {error
          ? `Update failed: ${error}. Showing data from ${updatedAt ? new Date(updatedAt).toLocaleString() : 'an earlier request'}.`
          : `Updated ${updatedAt ? new Date(updatedAt).toLocaleString() : ''}`}
      </Typography>
      <Box sx={{ display: 'grid', gap: 2, mt: 1, gridTemplateColumns: { md: '1fr 1fr' } }}>
        {view.widgets.map((widget) => (
          <Paper
            key={widget.id}
            variant="outlined"
            sx={{ p: 1, height: 380, display: 'flex', flexDirection: 'column' }}
          >
            <Typography variant="subtitle1" component="h2" sx={{ px: 1 }}>
              {widget.title}
              {widget.machineName ? ` · ${widget.machineName}` : ''}
            </Typography>
            <Box sx={{ flex: 1, minHeight: 0 }}>
              <TrendingExplorerWidgetView series={series[widget.id] ?? []} isLoading={false} />
            </Box>
          </Paper>
        ))}
      </Box>
    </Box>
  );
}
