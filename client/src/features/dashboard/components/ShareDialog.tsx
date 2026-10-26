import React from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  dashboardId: string;
  dashboardName: string;
}
/**
 *
 * @param root0
 * @param root0.open
 * @param root0.onClose
 * @param root0.dashboardName
 */
export default function ShareDialog({ open, onClose, dashboardName }: ShareDialogProps) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Share {dashboardName}</DialogTitle>
      <DialogContent>
        <Alert severity="info">
          Public links and embeds are disabled until selected-data permissions, expiry and
          revocation are qualified. Existing links cannot retrieve dashboards. Use a signed-in
          viewer account for this company.
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
