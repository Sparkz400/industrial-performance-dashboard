import React, { useState } from 'react';
import {
  Badge,
  IconButton,
  Popover,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  Button,
  Chip,
  Divider,
} from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import { useAlertStore } from '@/stores/useAlertStore';

const getSeverityColor = (severity: string): 'error' | 'warning' | 'info' | 'default' => {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    case 'low':
    case 'info':
      return 'info';
    default:
      return 'default';
  }
};

const AlertBadge: React.FC = () => {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const activeAlerts = useAlertStore((s) => s.activeAlerts);
  const unreadCount = useAlertStore((s) => s.unreadCount);
  const markAllRead = useAlertStore((s) => s.markAllRead);

  const handleOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleMarkAllRead = () => {
    markAllRead();
  };

  const open = Boolean(anchorEl);
  const recentAlerts = activeAlerts.slice(0, 10);

  return (
    <>
      <IconButton color="inherit" onClick={handleOpen}>
        <Badge badgeContent={unreadCount} color="error">
          <NotificationsActiveIcon />
        </Badge>
      </IconButton>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ width: 360, maxHeight: 400, overflow: 'auto' }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              p: 2,
              pb: 1,
            }}
          >
            <Typography variant="subtitle1" fontWeight="bold">
              Alerts
            </Typography>
            {unreadCount > 0 && (
              <Button size="small" onClick={handleMarkAllRead}>
                Mark all as read
              </Button>
            )}
          </Box>
          <Divider />
          {recentAlerts.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                No recent alerts
              </Typography>
            </Box>
          ) : (
            <List dense disablePadding>
              {recentAlerts.map((alert, index) => (
                <ListItem key={alert.id ?? index} divider>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                          label={alert.severity}
                          color={getSeverityColor(alert.severity)}
                          size="small"
                          sx={{ textTransform: 'capitalize' }}
                        />
                        <Typography variant="body2" noWrap>
                          {alert.ruleName}
                        </Typography>
                      </Box>
                    }
                    secondary={
                      <Typography variant="caption" color="text.secondary">
                        {alert.nodeKey} - {alert.message}
                      </Typography>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      </Popover>
    </>
  );
};

export default AlertBadge;
