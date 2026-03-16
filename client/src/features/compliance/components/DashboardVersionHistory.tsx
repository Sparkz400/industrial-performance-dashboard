import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Stack,
  CircularProgress,
  Alert,
  Divider,
  Radio,
} from '@mui/material';
import RestoreIcon from '@mui/icons-material/Restore';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import {
  useDashboardVersions,
  useDashboardDiff,
  useRestoreVersion,
  type DashboardVersion,
} from '../hooks/useComplianceQueries';

interface DashboardVersionHistoryProps {
  dashboardId: string;
}

const DashboardVersionHistory: React.FC<DashboardVersionHistoryProps> = ({ dashboardId }) => {
  const { data: versions, isLoading, error } = useDashboardVersions(dashboardId);
  const restoreVersion = useRestoreVersion();

  const [selectedA, setSelectedA] = useState<number>(0);
  const [selectedB, setSelectedB] = useState<number>(0);
  const [diffOpen, setDiffOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<DashboardVersion | null>(null);

  const { data: diffData, isLoading: diffLoading } = useDashboardDiff(
    dashboardId,
    selectedA,
    selectedB,
  );

  const handleViewDiff = () => {
    if (selectedA > 0 && selectedB > 0 && selectedA !== selectedB) {
      setDiffOpen(true);
    }
  };

  const handleRestore = (version: DashboardVersion) => {
    setRestoreTarget(version);
  };

  const confirmRestore = () => {
    if (!restoreTarget) return;
    restoreVersion.mutate(
      { dashboardId, version: restoreTarget.version },
      {
        onSuccess: () => setRestoreTarget(null),
      },
    );
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error">Failed to load version history: {(error as Error).message}</Alert>
    );
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">Version History</Typography>
        <Button
          variant="outlined"
          startIcon={<CompareArrowsIcon />}
          onClick={handleViewDiff}
          disabled={selectedA === 0 || selectedB === 0 || selectedA === selectedB}
          size="small"
        >
          Compare Selected
        </Button>
      </Stack>

      <Paper variant="outlined">
        <List disablePadding>
          {versions && versions.length > 0 ? (
            versions.map((version, idx) => (
              <React.Fragment key={version.version}>
                {idx > 0 && <Divider />}
                <ListItem
                  secondaryAction={
                    <Button
                      size="small"
                      startIcon={<RestoreIcon />}
                      onClick={() => handleRestore(version)}
                      disabled={idx === 0} // Cannot restore to current version
                    >
                      Restore
                    </Button>
                  }
                >
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mr: 2 }}>
                    <Radio
                      size="small"
                      checked={selectedA === version.version}
                      onChange={() => setSelectedA(version.version)}
                    />
                    <Radio
                      size="small"
                      checked={selectedB === version.version}
                      onChange={() => setSelectedB(version.version)}
                      color="secondary"
                    />
                  </Stack>
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip
                          label={`v${version.version}`}
                          size="small"
                          color={idx === 0 ? 'primary' : 'default'}
                        />
                        <Typography variant="body2">
                          {version.description || 'No description'}
                        </Typography>
                      </Stack>
                    }
                    secondary={`${version.createdBy} - ${new Date(version.createdAt).toLocaleString()}`}
                  />
                </ListItem>
              </React.Fragment>
            ))
          ) : (
            <ListItem>
              <ListItemText
                primary="No version history available."
                primaryTypographyProps={{ color: 'text.secondary', textAlign: 'center' }}
              />
            </ListItem>
          )}
        </List>
      </Paper>

      {/* Diff Dialog */}
      <Dialog open={diffOpen} onClose={() => setDiffOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Diff: v{selectedA} vs v{selectedB}
        </DialogTitle>
        <DialogContent>
          {diffLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : diffData && diffData.changes.length > 0 ? (
            <List dense>
              {diffData.changes.map((change, i) => (
                <ListItem key={i}>
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip
                          label={change.type}
                          size="small"
                          color={
                            change.type === 'added'
                              ? 'success'
                              : change.type === 'removed'
                                ? 'error'
                                : 'warning'
                          }
                        />
                        <Typography variant="body2" fontFamily="monospace">
                          {change.path}
                        </Typography>
                      </Stack>
                    }
                    secondary={
                      change.type === 'modified'
                        ? `${JSON.stringify(change.oldValue)} -> ${JSON.stringify(change.newValue)}`
                        : undefined
                    }
                  />
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              No differences found.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDiffOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Restore Confirmation Dialog */}
      <Dialog open={!!restoreTarget} onClose={() => setRestoreTarget(null)}>
        <DialogTitle>Restore Version</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to restore this dashboard to version{' '}
            <strong>v{restoreTarget?.version}</strong>? This will create a new version with the
            restored content.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRestoreTarget(null)}>Cancel</Button>
          <Button
            onClick={confirmRestore}
            variant="contained"
            color="warning"
            disabled={restoreVersion.isPending}
          >
            {restoreVersion.isPending ? 'Restoring...' : 'Restore'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DashboardVersionHistory;
