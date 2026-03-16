import React, { useState } from 'react';
import { Button, CircularProgress } from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { API_ENDPOINTS } from '@/config/config';
import { protectedFetch } from '@/utils/protectedFetch';

interface ExportButtonProps {
  nodeKeys: string[];
  machineId?: number;
  startDate: string;
  endDate: string;
}

const ExportButton: React.FC<ExportButtonProps> = ({ nodeKeys, machineId, startDate, endDate }) => {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (nodeKeys.length === 0) return;
    setExporting(true);
    try {
      const params = new URLSearchParams({
        nodeKeys: nodeKeys.join(','),
        startDate,
        endDate,
      });
      if (machineId) params.set('machineId', String(machineId));

      const res = await protectedFetch(`${API_ENDPOINTS.trending.exportCsv}?${params}`);
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `trending-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button
      size="small"
      variant="outlined"
      startIcon={exporting ? <CircularProgress size={16} /> : <FileDownloadIcon />}
      onClick={handleExport}
      disabled={exporting || nodeKeys.length === 0}
    >
      Export CSV
    </Button>
  );
};

export default ExportButton;
