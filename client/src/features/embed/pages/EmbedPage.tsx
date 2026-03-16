import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography, CircularProgress, alpha } from '@mui/material';
import { Responsive, WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import WidgetContainer from '../../widgets/components/WidgetContainer';
import { api } from '@/utils/api';
import type { Dashboard, Widget, LayoutItem } from '@/types';

const ResponsiveGridLayout = WidthProvider(Responsive);

interface EmbedPageProps {
  mode: 'shared' | 'embed';
}

/**
 *
 * @param root0
 * @param root0.mode
 */
export default function EmbedPage({ mode }: EmbedPageProps) {
  const { token } = useParams<{ token: string }>();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;

    const request =
      mode === 'embed'
        ? api.endpoints.getEmbedDashboard(token)
        : api.endpoints.getPublicDashboard(token);

    Promise.resolve(request)
      .then((data) => {
        setDashboard((data as { dashboard: Dashboard }).dashboard);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [token, mode]);

  const widgets = useMemo<Widget[]>(() => {
    if (!dashboard) return [];
    return Array.isArray(dashboard.widgets) ? (dashboard.widgets as Widget[]) : [];
  }, [dashboard]);

  const layout = useMemo<LayoutItem[]>(() => {
    if (!dashboard) return [];
    return Array.isArray(dashboard.layout) ? (dashboard.layout as LayoutItem[]) : [];
  }, [dashboard]);

  const layoutMap = useMemo(() => {
    const map = new Map<string, LayoutItem>();
    layout.forEach((item) => map.set(item.i, item));
    return map;
  }, [layout]);

  if (loading) {
    return (
      <Box
        sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <Typography variant="h5" color="error">
          {error === 'Share link not found' || error === 'Embed link not found'
            ? 'This link is no longer available'
            : error}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          The dashboard may have been unshared or the link may have expired.
        </Typography>
      </Box>
    );
  }

  if (!dashboard) return null;

  const isEmbed = mode === 'embed';

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        p: isEmbed ? 1 : 2,
      }}
    >
      {/* Header (hidden in embed mode for cleaner TV displays) */}
      {!isEmbed && (
        <Box
          sx={{
            mb: 2,
            p: 2,
            borderRadius: 2,
            bgcolor: (theme) => alpha(theme.palette.background.paper, 0.8),
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography variant="h5" fontWeight={600}>
            {dashboard.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Shared Dashboard
          </Typography>
        </Box>
      )}

      {/* Grid */}
      <ResponsiveGridLayout
        className="layout"
        layouts={{ lg: layout, md: layout, sm: layout, xs: layout, xxs: layout }}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 12, sm: 12, xs: 12, xxs: 12 }}
        rowHeight={35}
        isDraggable={false}
        isResizable={false}
        margin={[16, 16]}
        containerPadding={[0, 0]}
      >
        {widgets.map((widget) => {
          const layoutItem = layoutMap.get(widget.id);
          return (
            <div key={widget.id}>
              <WidgetContainer widget={widget} onDelete={() => {}} layoutItem={layoutItem} />
            </div>
          );
        })}
      </ResponsiveGridLayout>
    </Box>
  );
}
