import React, { useState, useRef } from 'react';
import {
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Divider,
  Typography,
} from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ImageIcon from '@mui/icons-material/Image';
import TableChartIcon from '@mui/icons-material/TableChart';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import DataObjectIcon from '@mui/icons-material/DataObject';
import LinkIcon from '@mui/icons-material/Link';
import { toPng, toSvg } from 'html-to-image';
import { saveAs } from 'file-saver';
import { API_ENDPOINTS } from '@/config/config';
import api from '@/utils/api';
import type { Widget, LayoutItem } from '@/types';

interface DashboardConfig {
  id?: string;
  name: string;
  widgets: Widget[];
  layout: LayoutItem[];
}

interface ExportMenuProps {
  widgetRef?: React.RefObject<HTMLElement | null>;
  widgetTitle?: string;
  data?: Record<string, unknown>[];
  dataKeys?: string[];
  dashboard?: DashboardConfig;
  onDashboardImported?: (dashboard: DashboardConfig) => void;
}

const ExportMenu: React.FC<ExportMenuProps> = ({
  widgetRef,
  widgetTitle = 'widget',
  data,
  dataKeys,
  dashboard,
  onDashboardImported,
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportPng = async () => {
    setAnchorEl(null);
    if (!widgetRef?.current) return;
    try {
      const dataUrl = await toPng(widgetRef.current, {
        backgroundColor: '#1A1D27',
        pixelRatio: 2,
      });
      saveAs(dataUrl, `${widgetTitle.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.png`);
    } catch (err) {
      console.error('Export PNG failed:', err);
    }
  };

  const handleExportSvg = async () => {
    setAnchorEl(null);
    if (!widgetRef?.current) return;
    try {
      const dataUrl = await toSvg(widgetRef.current);
      saveAs(dataUrl, `${widgetTitle.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.svg`);
    } catch (err) {
      console.error('Export SVG failed:', err);
    }
  };

  const handleExportCsv = () => {
    setAnchorEl(null);
    if (!data || data.length === 0) return;

    const keys = dataKeys || Object.keys(data[0]);
    const header = keys.join(',');
    const rows = data.map((row) =>
      keys
        .map((key) => {
          // eslint-disable-next-line security/detect-object-injection -- key comes from Object.keys(data[0]) or dataKeys prop, not user input
          const val = row[key];
          return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
        })
        .join(','),
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    saveAs(blob, `${widgetTitle.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.csv`);
  };

  const handleCopyLink = () => {
    setAnchorEl(null);
    if (dashboard?.id) {
      const url = `${window.location.origin}/dashboard/${dashboard.id}`;
      navigator.clipboard.writeText(url);
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  };

  const handleExportDashboardJson = () => {
    setAnchorEl(null);
    if (!dashboard) return;

    const exportData = {
      name: dashboard.name,
      widgets: dashboard.widgets,
      layout: dashboard.layout,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    saveAs(blob, `${dashboard.name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.json`);
  };

  const handleImportDashboardJson = () => {
    setAnchorEl(null);
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const imported = JSON.parse(text);

      if (!imported.name || !Array.isArray(imported.widgets) || !Array.isArray(imported.layout)) {
        console.error('Invalid dashboard JSON: missing name, widgets, or layout');
        return;
      }

      const response = (await api.post(`${API_ENDPOINTS.dashboards}/import`, {
        name: imported.name,
        widgets: imported.widgets,
        layout: imported.layout,
      })) as DashboardConfig;

      if (onDashboardImported) {
        onDashboardImported(response);
      }
    } catch (err) {
      console.error('Import dashboard failed:', err);
    }

    // Reset the input so the same file can be imported again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const hasDashboard = Boolean(dashboard);

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileSelected}
      />

      <Tooltip title="Export / Share">
        <IconButton
          size="small"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            background: 'rgba(131,131,131,0.8)',
            '&:hover': { background: 'rgba(100,100,100,0.9)' },
          }}
        >
          <FileDownloadIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <Typography
          variant="caption"
          sx={{ px: 2, py: 0.5, color: 'text.disabled', fontWeight: 600 }}
        >
          EXPORT
        </Typography>
        <MenuItem onClick={handleExportPng} disabled={!widgetRef?.current}>
          <ListItemIcon>
            <ImageIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Export as PNG</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleExportSvg} disabled={!widgetRef?.current}>
          <ListItemIcon>
            <ImageIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Export as SVG</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleExportCsv} disabled={!data || data.length === 0}>
          <ListItemIcon>
            <TableChartIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Export as CSV</ListItemText>
        </MenuItem>

        {hasDashboard && [
          <Divider key="dashboard-divider" />,
          <Typography
            key="dashboard-label"
            variant="caption"
            sx={{ px: 2, py: 0.5, color: 'text.disabled', fontWeight: 600 }}
          >
            DASHBOARD
          </Typography>,
          <MenuItem key="export-json" onClick={handleExportDashboardJson}>
            <ListItemIcon>
              <DataObjectIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Export dashboard as JSON</ListItemText>
          </MenuItem>,
          <MenuItem key="import-json" onClick={handleImportDashboardJson}>
            <ListItemIcon>
              <FileUploadIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Import dashboard from JSON</ListItemText>
          </MenuItem>,
        ]}

        <Divider />
        <Typography
          variant="caption"
          sx={{ px: 2, py: 0.5, color: 'text.disabled', fontWeight: 600 }}
        >
          SHARE
        </Typography>
        <MenuItem onClick={handleCopyLink}>
          <ListItemIcon>
            {hasDashboard ? <LinkIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
          </ListItemIcon>
          <ListItemText>{hasDashboard ? 'Copy share link' : 'Copy page link'}</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
};

export default ExportMenu;
