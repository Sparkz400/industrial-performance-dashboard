import { useT } from '@/i18n';
import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ViewQuiltIcon from '@mui/icons-material/ViewQuilt';
import { motion } from 'framer-motion';

import AddWidgetButton from './addWidgetButton';
const WidgetPreviewPopup = React.lazy(() => import('../../widgets/components/WidgetPreviewPopup'));

interface WidgetManagementPanelProps {
  hasDashboards: boolean;
  hasWidgets: boolean;
  initialized: boolean;
  previewOpen: boolean;
  onOpenPreview: () => void;
  onClosePreview: () => void;
  onAddWidget: (widgetType: string) => void;
  onOpenTemplates: () => void;
}

const WidgetManagementPanel: React.FC<WidgetManagementPanelProps> = ({
  hasDashboards,
  hasWidgets,
  initialized,
  previewOpen,
  onOpenPreview,
  onClosePreview,
  onAddWidget,
  onOpenTemplates,
}) => {
  const t = useT();
  return (
    <>
      {/* Empty state for no dashboards */}
      {!hasDashboards && initialized && (
        <Box
          sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}
        >
          <Typography variant="h6" color="textSecondary">
            {t("No dashboards exist. Click 'New' to create one.")}
          </Typography>
        </Box>
      )}

      {/* Empty state for no widgets - drag drop hint */}
      {hasDashboards && !hasWidgets && initialized && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '50vh',
              border: '2px dashed',
              borderColor: 'divider',
              borderRadius: 4,
              p: 4,
            }}
          >
            <Typography
              variant="h6"
              gutterBottom
              sx={{
                color: 'text.disabled',
              }}
            >
              {t('No widgets yet')}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: 'text.disabled',
                mb: 2,
                textAlign: 'center',
              }}
            >
              {t('Click the + button to browse widgets, or try a template')}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="contained" startIcon={<AddIcon />} onClick={onOpenPreview}>
                {t('Add Widget')}
              </Button>
              <Button variant="outlined" startIcon={<ViewQuiltIcon />} onClick={onOpenTemplates}>
                {t('Use Template')}
              </Button>
            </Box>
          </Box>
        </motion.div>
      )}

      {/* Add Widget Button & Preview Dialog */}
      {hasDashboards && (
        <>
          <AddWidgetButton onClick={onOpenPreview} />
          {previewOpen && (
            <React.Suspense
              fallback={<Typography role="status">{t('Loading widgets…')}</Typography>}
            >
              <WidgetPreviewPopup open onClose={onClosePreview} onSelect={onAddWidget} />
            </React.Suspense>
          )}
        </>
      )}
    </>
  );
};

export default WidgetManagementPanel;
