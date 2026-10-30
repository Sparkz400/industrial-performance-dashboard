import { useT } from '@/i18n';
import React from 'react';
import {
  Box,
  Badge,
  IconButton,
  Drawer,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Button,
  Divider,
  alpha,
  Tooltip,
} from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import CloseIcon from '@mui/icons-material/Close';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { formatDistanceToNow } from 'date-fns';

const severityConfig: Record<string, { icon: React.ReactNode; color: string }> = {
  critical: { icon: <ErrorOutlineIcon />, color: '#F44336' },
  high: { icon: <ErrorOutlineIcon />, color: '#FF5722' },
  medium: { icon: <WarningAmberIcon />, color: '#FF9800' },
  low: { icon: <InfoOutlinedIcon />, color: '#29B6F6' },
  info: { icon: <CheckCircleOutlineIcon />, color: '#66BB6A' },
};

const NotificationCenter: React.FC = () => {
  const t = useT();

  const {
    notifications,
    unreadCount,
    isOpen,
    togglePanel,
    setOpen,
    markAsRead,
    markAllAsRead,
    clearAll,
    removeNotification,
  } = useNotificationStore();

  return (
    <>
      <Tooltip title={`${unreadCount} unread notifications`}>
        <IconButton
          onClick={togglePanel}
          sx={{
            position: 'relative',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '10px',
            width: 36,
            height: 36,
          }}
        >
          <Badge
            badgeContent={unreadCount}
            color="error"
            max={99}
            sx={{
              '& .MuiBadge-badge': {
                fontSize: '0.65rem',
                fontWeight: 700,
                minWidth: 18,
                height: 18,
              },
            }}
          >
            <NotificationsIcon sx={{ fontSize: 18 }} />
          </Badge>
        </IconButton>
      </Tooltip>

      <Drawer
        anchor="right"
        open={isOpen}
        onClose={() => setOpen(false)}
        slotProps={{
          paper: {
            sx: {
              width: { xs: '100vw', sm: 380 },
              maxWidth: '100vw',
            },
          },
        }}
      >
        {/* Header */}
        <Box
          sx={{
            px: 2.5,
            py: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <NotificationsIcon sx={{ color: 'primary.main' }} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {t('Notifications')}
            </Typography>
            {unreadCount > 0 && (
              <Chip label={unreadCount} color="error" size="small" sx={{ height: 22 }} />
            )}
          </Box>
          <IconButton onClick={() => setOpen(false)} size="small">
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Actions */}
        <Box sx={{ px: 2, py: 1, display: 'flex', gap: 1 }}>
          <Button
            size="small"
            startIcon={<DoneAllIcon />}
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
            sx={{ fontSize: '0.75rem' }}
          >
            {t('Mark all read')}
          </Button>
          <Button
            size="small"
            startIcon={<DeleteSweepIcon />}
            onClick={clearAll}
            disabled={notifications.length === 0}
            color="error"
            sx={{ fontSize: '0.75rem' }}
          >
            {t('Clear all')}
          </Button>
        </Box>

        <Divider />

        {/* Notification List */}
        <List sx={{ flexGrow: 1, overflowY: 'auto', py: 0 }}>
          <AnimatePresence>
            {notifications.length === 0 ? (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <NotificationsIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography
                  sx={{
                    color: 'text.secondary',
                  }}
                >
                  {t('No notifications')}
                </Typography>
              </Box>
            ) : (
              notifications.map((notif, index) => {
                const config = severityConfig[notif.severity] || severityConfig.info;
                return (
                  <motion.div
                    key={notif.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20, height: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.03 }}
                  >
                    <ListItem
                      onClick={() => markAsRead(notif.id)}
                      sx={{
                        cursor: 'pointer',
                        py: 1.5,
                        px: 2,
                        borderLeft: '3px solid',
                        borderLeftColor: config.color,
                        bgcolor: notif.read ? 'transparent' : () => alpha(config.color, 0.04),
                        '&:hover': {
                          bgcolor: () => alpha(config.color, 0.08),
                        },
                        transition: 'all 0.2s ease',
                      }}
                      secondaryAction={
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeNotification(notif.id);
                          }}
                        >
                          <CloseIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      }
                    >
                      <ListItemIcon sx={{ minWidth: 36, color: config.color }}>
                        {config.icon}
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: notif.read ? 400 : 600, lineHeight: 1.3 }}
                            >
                              {notif.title}
                            </Typography>
                            {!notif.read && (
                              <Box
                                sx={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: '50%',
                                  bgcolor: 'primary.main',
                                  flexShrink: 0,
                                }}
                              />
                            )}
                          </Box>
                        }
                        secondary={
                          <>
                            <Typography
                              variant="caption"
                              sx={{ color: 'text.secondary', display: 'block' }}
                            >
                              {notif.message}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{ color: 'text.disabled', fontSize: '0.7rem' }}
                            >
                              {formatDistanceToNow(new Date(notif.timestamp), { addSuffix: true })}
                              {notif.source && ` - ${notif.source}`}
                            </Typography>
                          </>
                        }
                      />
                    </ListItem>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </List>
      </Drawer>
    </>
  );
};

export default NotificationCenter;
