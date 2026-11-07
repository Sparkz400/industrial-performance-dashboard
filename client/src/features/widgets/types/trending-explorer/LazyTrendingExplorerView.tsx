import React, { Suspense } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { translate as t } from '@/i18n';

// The chart library is large; panels that only sometimes draw a chart load it on demand.
const TrendingExplorerWidgetView = React.lazy(() => import('./TrendingExplorerWidgetView'));

/**
 * @param props Same props as TrendingExplorerWidgetView.
 */
export default function LazyTrendingExplorerView(
  props: React.ComponentProps<typeof TrendingExplorerWidgetView>,
) {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
          <CircularProgress size={24} aria-label={t('Loading chart')} />
        </Box>
      }
    >
      <TrendingExplorerWidgetView {...props} />
    </Suspense>
  );
}
