import React, { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  MenuItem,
  Stack,
  Alert,
  CircularProgress,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/utils/api';
import { API_ENDPOINTS } from '@/config/config';
import DashboardVersionHistory from '../components/DashboardVersionHistory';

interface DashboardListItem {
  id: string;
  name: string;
}

const ComplianceVersionsTab: React.FC = () => {
  const [selectedDashboard, setSelectedDashboard] = useState('');

  const {
    data: dashboards,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['dashboards-list'],
    queryFn: () => api.get(API_ENDPOINTS.dashboards) as Promise<DashboardListItem[]>,
  });

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Dashboard Version History
      </Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        View, compare, and restore dashboard versions. Each version creates a snapshot that can be
        used for auditing and rollback.
      </Alert>

      <Stack spacing={3}>
        <TextField
          select
          label="Select Dashboard"
          value={selectedDashboard}
          onChange={(e) => setSelectedDashboard(e.target.value)}
          size="small"
          sx={{ maxWidth: 400 }}
          disabled={isLoading}
        >
          <MenuItem value="">
            <em>Choose a dashboard...</em>
          </MenuItem>
          {dashboards?.map((d) => (
            <MenuItem key={d.id} value={d.id}>
              {d.name}
            </MenuItem>
          ))}
        </TextField>

        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Alert severity="error">Failed to load dashboards: {(error as Error).message}</Alert>
        )}

        {selectedDashboard && <DashboardVersionHistory dashboardId={selectedDashboard} />}

        {!selectedDashboard && !isLoading && (
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
              py: 4,
              textAlign: 'center',
            }}
          >
            Select a dashboard above to view its version history.
          </Typography>
        )}
      </Stack>
    </Box>
  );
};

export default ComplianceVersionsTab;
