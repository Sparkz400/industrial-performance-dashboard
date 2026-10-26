import { useT } from '@/i18n';
import { useAuthStore } from '@/stores/useAuthStore';
import { Tabs, Tab } from '@mui/material';
import React from 'react';
import {
  Box,
  Typography,
  Tooltip,
  FormControlLabel,
  Switch,
  IconButton,
  alpha,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import ViewQuiltIcon from '@mui/icons-material/ViewQuilt';
import ShareIcon from '@mui/icons-material/Share';

import DashboardTabs from './DashboardTabs';
import TimeRangePicker from './TimeRangePicker';
import AutoRefreshIndicator from './AutoRefreshIndicator';
import NotificationCenter from './NotificationCenter';
import ExportMenu from './ExportMenu';
import { ButtonLoader } from '@/shared/components/loading/index';
import ShareDialog from './ShareDialog';

import type { Dashboard, Widget, LayoutItem } from '@/types';

interface DashboardExportConfig {
  id?: string;
  name: string;
  widgets: Widget[];
  layout: LayoutItem[];
}

interface DashboardToolbarProps {
  dashboards: Dashboard[];
  selectedIndex: number;
  selectedDashboardId: string | null;
  editingDashboardId: string | null;
  isLoading: boolean;
  isSaving: boolean;
  hasLocalChanges: boolean;
  serverSyncStatus: string;
  autoSync: boolean;
  widgets: Widget[];
  layout: LayoutItem[];
  onSelectDashboard: (event: React.SyntheticEvent, newIndex: number) => void;
  onEditName: (dashboardId: string, newName?: string | null) => void;
  onDeleteDashboard: (dashboardId: string) => void;
  onSyncWithServer: () => void;
  onAddDashboard: (event?: React.MouseEvent) => void;
  onAutoSyncChange: (enabled: boolean) => void;
  onOpenTemplates: () => void;
  onDashboardImported: (imported: DashboardExportConfig) => void;
}

const DashboardToolbar: React.FC<DashboardToolbarProps> = ({
  dashboards,
  selectedIndex,
  selectedDashboardId,
  editingDashboardId,
  isLoading,
  isSaving,
  hasLocalChanges,
  serverSyncStatus,
  autoSync,
  widgets,
  layout,
  onSelectDashboard,
  onEditName,
  onDeleteDashboard,
  onSyncWithServer,
  onAddDashboard,
  onAutoSyncChange,
  onOpenTemplates,
  onDashboardImported,
}) => {
  const t = useT();

  const editable = useAuthStore((s) => s.user?.role === 'admin');
  const [shareOpen, setShareOpen] = React.useState(false);
  const selectedDashboard = dashboards.find((d) => d.id === selectedDashboardId);

  const exportDashboard = (() => {
    const d = dashboards.find((db) => db.id === selectedDashboardId);
    return d ? { id: d.id, name: d.name, widgets, layout } : undefined;
  })();

  if (!editable)
    return (
      <Box sx={{ p: 2, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        <Tabs
          value={dashboards.length ? Math.max(0, selectedIndex) : false}
          onChange={(event, value) => onSelectDashboard(event, value)}
          variant="scrollable"
          aria-label={t('Dashboards')}
        >
          {dashboards.map((d) => (
            <Tab key={d.id} label={d.name} />
          ))}
        </Tabs>
        <TimeRangePicker />
        <NotificationCenter />
        {dashboards.length === 0 && (
          <Typography>
            {t('No dashboards assigned. Use Production or Daily operations for your machines.')}
          </Typography>
        )}
      </Box>
    );
  return (
    <Box
      sx={{
        borderBottom: 1,
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        px: 2,
        py: 0.5,
        gap: 1,
        background: (theme) => alpha(theme.palette.background.paper, 0.5),
        backdropFilter: 'blur(8px)',
      }}
    >
      <DashboardTabs
        dashboards={dashboards}
        selectedIndex={selectedIndex !== -1 ? selectedIndex : 0}
        onSelectDashboard={onSelectDashboard}
        onEditName={onEditName}
        onDeleteDashboard={onDeleteDashboard}
        editingDashboardId={editingDashboardId}
        loading={isLoading || isSaving}
      />

      <Box sx={{ flexGrow: 1 }} />

      {/* Time Range & Controls */}
      <TimeRangePicker />
      <AutoRefreshIndicator />

      <Box sx={{ width: 1, height: 24, bgcolor: 'divider', mx: 0.5 }} />

      <NotificationCenter />

      {selectedDashboardId && (
        <>
          <ExportMenu dashboard={exportDashboard} onDashboardImported={onDashboardImported} />
          <Tooltip title={t('Share Dashboard')}>
            <IconButton
              size="small"
              onClick={() => setShareOpen(true)}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: '10px',
                width: 36,
                height: 36,
              }}
            >
              <ShareIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <ShareDialog
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            dashboardId={selectedDashboardId}
            dashboardName={selectedDashboard?.name || 'Dashboard'}
          />
        </>
      )}

      <Tooltip title={t('Dashboard Templates')}>
        <IconButton
          size="small"
          onClick={onOpenTemplates}
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '10px',
            width: 36,
            height: 36,
          }}
        >
          <ViewQuiltIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>

      <Box sx={{ width: 1, height: 24, bgcolor: 'divider', mx: 0.5 }} />

      <Tooltip title={t('Save Changes to Server')}>
        <span>
          <ButtonLoader
            variant="contained"
            color="primary"
            onClick={onSyncWithServer}
            loading={isSaving || serverSyncStatus === 'syncing'}
            disabled={!hasLocalChanges}
            startIcon={<SaveIcon />}
            size="small"
          >
            {t('Save')}
          </ButtonLoader>
        </span>
      </Tooltip>
      <Tooltip title={t('Add New Dashboard')}>
        <span>
          <ButtonLoader
            variant="outlined"
            color="secondary"
            onClick={onAddDashboard}
            loading={isLoading && !isSaving}
            startIcon={<AddIcon />}
            size="small"
          >
            {t('New')}
          </ButtonLoader>
        </span>
      </Tooltip>
      <FormControlLabel
        control={
          <Switch
            checked={autoSync}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onAutoSyncChange(e.target.checked)
            }
            size="small"
          />
        }
        label={<Typography variant="caption">{t('Auto Sync')}</Typography>}
        sx={{ ml: 0, mr: 0 }}
      />
    </Box>
  );
};

export default DashboardToolbar;
