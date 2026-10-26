import React from 'react';
import { Alert, Box, Typography } from '@mui/material';
/**
 *
 */
export default function NotificationChannelsPage() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4">Notification delivery</Typography>
      <Alert severity="info" sx={{ mt: 2 }}>
        Alarm history and signed webhooks are available. Configure alarm.triggered and alarm.cleared
        in Settings → Webhooks. Delivery attempts survive restarts; receivers must deduplicate the
        delivery ID. Email, Slack, Teams and SMS channels are unavailable. Existing channel records
        are retained but do not send messages.
      </Alert>
    </Box>
  );
}
