import React from 'react';
import { TextField, Card, CardHeader, CardContent, Divider, Chip, Avatar } from '@mui/material';
import Grid from '@mui/material/Grid2';
import StorageIcon from '@mui/icons-material/Storage';
import CachedIcon from '@mui/icons-material/Cached';
import { ButtonLoader } from '@/shared/components/loading/index';

interface DatabaseConnectionCardProps {
  dbOnline: boolean;
  dbHost: string;
  dbPort: string;
  dbUser: string;
  dbName: string;
  handleTestDbConnection: () => void;
  loading: boolean;
}

const DatabaseConnectionCard: React.FC<DatabaseConnectionCardProps> = ({
  dbOnline,
  dbHost,
  dbPort,
  dbUser,
  dbName,
  handleTestDbConnection,
  loading,
}) => (
  <Card>
    <CardHeader
      title="Database Connection"
      avatar={
        <Avatar>
          <StorageIcon />
        </Avatar>
      }
      action={
        <Chip
          label={dbOnline ? 'Connected' : 'Disconnected'}
          color={dbOnline ? 'success' : 'default'}
          size="small"
        />
      }
      sx={{ pb: 1 }}
    />
    <Divider />
    <CardContent sx={{ pt: 2 }}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            label="Host"
            variant="outlined"
            fullWidth
            size="small"
            value={dbHost}
            disabled
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            label="Port"
            variant="outlined"
            fullWidth
            size="small"
            value={dbPort}
            disabled
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            label="User"
            variant="outlined"
            fullWidth
            size="small"
            value={dbUser}
            disabled
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            label="Database"
            variant="outlined"
            fullWidth
            size="small"
            value={dbName}
            disabled
          />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <ButtonLoader
            variant="contained"
            color="primary"
            onClick={handleTestDbConnection}
            loading={loading}
            startIcon={<CachedIcon />}
            size="small"
          >
            Test Connection
          </ButtonLoader>
        </Grid>
      </Grid>
    </CardContent>
  </Card>
);

export default DatabaseConnectionCard;
