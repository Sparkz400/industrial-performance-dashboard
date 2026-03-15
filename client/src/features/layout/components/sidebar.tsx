import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Box,
  Divider,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
  Badge,
  Collapse,
  alpha,
  CircularProgress,
} from '@mui/material';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SettingsIcon from '@mui/icons-material/Settings';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import BurgerButton from './burgerButton';
import { useThemeStore } from '@/stores/useThemeStore';
import { useStatusStore } from '@/stores/useStatusStore';

import type { ServiceStatus } from '@/types';

// Simple debounce function
/**
 *
 * @param func
 * @param delay
 */
function debounce<T extends (...args: unknown[]) => void>(
  func: T,
  delay: number,
): T & { cancel?: () => void } {
  let timer: ReturnType<typeof setTimeout>;
  const debounced = (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func(...args);
    }, delay);
  };
  return debounced as T & { cancel?: () => void };
}

// Get icon based on status
/**
 *
 * @param statusItem
 */
function getStatusIcon(statusItem?: ServiceStatus): React.JSX.Element {
  const statusStr = statusItem?.status?.toLowerCase() || 'unknown'; // Access the 'status' property

  if (statusStr === 'connected' || statusStr === 'ok') return <CheckCircleIcon color="success" />; // Use MUI color prop
  if (statusStr === 'warning') return <WarningIcon color="warning" />;
  if (statusStr === 'error' || statusStr === 'disconnected') return <ErrorIcon color="error" />;
  if (statusStr === 'connecting') return <CircularProgress size={18} color="info" />; // Add connecting icon
  return <HelpOutlineIcon color="disabled" />; // Default/Unknown icon
}

interface ResponsiveSidebarProps {
  open: boolean;
  onToggle: () => void;
  onWidthChange: (width: number) => void;
}

const ResponsiveSidebar: React.FC<ResponsiveSidebarProps> = ({ open, onToggle, onWidthChange }) => {
  const themeMode = useThemeStore((s) => s.themeMode);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const theme = useMuiTheme();
  const location = useLocation();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [statusExpanded, setStatusExpanded] = useState<boolean>(false);
  const status = useStatusStore((s) => s.status);
  const socketConnected = useStatusStore((s) => s.socketConnected);

  const overallStatus = status?.overall?.status || 'UNKNOWN';

  // Get badge color for overall status
  const getOverallBadgeColor = (): 'success' | 'warning' | 'error' | 'info' | 'default' => {
    switch (overallStatus.toLowerCase()) {
      case 'connected':
      case 'ok':
        return 'success';
      case 'warning':
        return 'warning';
      case 'error':
      case 'disconnected':
        return 'error';
      case 'connecting':
        return 'info';
      default:
        return 'default';
    }
  };

  const measureWidth = useCallback((): number => {
    if (!contentRef.current) return 0;
    const width = open ? contentRef.current.scrollWidth : 56; // Collapsed width
    const maxSidebarWidth = window.innerWidth * 0.3;
    return Math.min(width, maxSidebarWidth);
  }, [open]);

  useEffect(() => {
    // Flag to track if component is mounted
    let isMounted = true;

    // Measure and update sidebar width when open changes
    // Use a safer approach than requestAnimationFrame
    const updateWidth = (): void => {
      if (!isMounted) return;

      const width = measureWidth();
      onWidthChange(width);
    };

    // Schedule the initial update
    const initialUpdateTimeout = setTimeout(updateWidth, 10);

    // Create a proper debounced resize handler that checks mount state
    const handleResize = (): void => {
      if (!isMounted) return;

      const width = measureWidth();
      onWidthChange(width);
    };

    // Create the debounced version
    const debouncedHandleResize = debounce(handleResize, 200);

    // Add event listener
    window.addEventListener('resize', debouncedHandleResize);

    // Comprehensive cleanup
    return () => {
      isMounted = false;
      clearTimeout(initialUpdateTimeout);

      // Remove event listener
      window.removeEventListener('resize', debouncedHandleResize);

      // Cancel any pending debounced calls
      if (debouncedHandleResize.cancel) {
        debouncedHandleResize.cancel();
      }
    };
  }, [open, measureWidth, onWidthChange]);

  const toggleStatus = useCallback((): void => {
    setStatusExpanded((prev) => !prev);
  }, []);

  // Get status text directly from the standardized object
  const getDatabaseStatusText = (): string => status?.database?.statusText || 'Unknown';
  const getOpcuaStatusText = (): string => status?.opcua?.statusText || 'Unknown';

  return (
    <Drawer
      variant="persistent"
      open={true} // Always open from MUI's perspective; we control the width via CSS
      PaperProps={{
        sx: {
          position: 'fixed',
          overflowX: 'hidden',
          overflowY: 'auto',
          height: '100vh',
          width: open ? 'auto' : '56px',
          transition: 'width 0.3s ease',
          borderRight: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
        },
      }}
      sx={{ flexShrink: 0 }}
    >
      <Box
        ref={contentRef}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          bgcolor: theme.palette.background.paper,
          color: theme.palette.text.primary,
          whiteSpace: 'nowrap',
          py: 1,
          px: 0,
        }}
      >
        <List disablePadding sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Burger button */}
          <ListItem
            disablePadding
            sx={{
              display: 'flex',
              justifyContent: open ? 'space-between' : 'center',
              py: 1,
              px: 2,
            }}
          >
            <BurgerButton checked={open} onChange={onToggle} />
            {open && (
              <Typography variant="subtitle1" fontWeight="bold">
                Dashboard
              </Typography>
            )}
          </ListItem>
          <Divider sx={{ my: 1 }} />

          {/* Main navigation */}
          <ListItem disablePadding>
            <ListItemButton
              component={Link}
              to="/"
              selected={location.pathname === '/'}
              sx={{
                py: 1.5,
                justifyContent: open ? 'flex-start' : 'center',
                '&.Mui-selected': {
                  bgcolor: alpha(theme.palette.primary.main, 0.1),
                  '&:hover': {
                    bgcolor: alpha(theme.palette.primary.main, 0.2),
                  },
                  '& .MuiListItemIcon-root': {
                    color: theme.palette.primary.main,
                  },
                  '& .MuiListItemText-primary': {
                    fontWeight: 'bold',
                    color: theme.palette.primary.main,
                  },
                },
              }}
            >
              <ListItemIcon
                sx={{ minWidth: open ? 40 : 'auto', color: theme.palette.text.primary }}
              >
                <DashboardIcon />
              </ListItemIcon>
              {open && <ListItemText primary="Dashboard" />}
            </ListItemButton>
          </ListItem>

          {/* Machines */}
          <ListItem disablePadding>
            <ListItemButton
              component={Link}
              to="/machines"
              selected={location.pathname === '/machines'}
              sx={{
                py: 1.5,
                justifyContent: open ? 'flex-start' : 'center',
                '&.Mui-selected': {
                  bgcolor: alpha(theme.palette.primary.main, 0.1),
                  '&:hover': {
                    bgcolor: alpha(theme.palette.primary.main, 0.2),
                  },
                  '& .MuiListItemIcon-root': {
                    color: theme.palette.primary.main,
                  },
                  '& .MuiListItemText-primary': {
                    fontWeight: 'bold',
                    color: theme.palette.primary.main,
                  },
                },
              }}
            >
              <ListItemIcon
                sx={{ minWidth: open ? 40 : 'auto', color: theme.palette.text.primary }}
              >
                <PrecisionManufacturingIcon />
              </ListItemIcon>
              {open && <ListItemText primary="Machines" />}
            </ListItemButton>
          </ListItem>

          {/* Middle space */}
          <Box sx={{ flexGrow: 1 }} />

          {/* System status section */}
          <ListItem disablePadding>
            <ListItemButton
              onClick={toggleStatus}
              sx={{ py: 1.5, justifyContent: open ? 'flex-start' : 'center' }}
            >
              <ListItemIcon sx={{ minWidth: open ? 40 : 'auto' }}>
                <Badge
                  color={getOverallBadgeColor()}
                  variant="dot"
                  overlap="circular"
                  anchorOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                  }}
                >
                  <NetworkCheckIcon color={socketConnected ? 'success' : 'action'} />
                </Badge>
              </ListItemIcon>
              {open && (
                <>
                  <ListItemText
                    primary="System Status"
                    secondary={socketConnected ? null : 'Polling'}
                  />
                  {statusExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </>
              )}
            </ListItemButton>
          </ListItem>

          {/* Collapsible status details */}
          {open && (
            <Collapse in={statusExpanded} timeout="auto" unmountOnExit>
              <List component="div" disablePadding>
                <ListItem sx={{ py: 0.5, pl: 4 }}>
                  {/* Pass the whole status.database object */}
                  <ListItemIcon
                    sx={{
                      minWidth: 40,
                      color: status?.database?.statusColor || theme.palette.text.disabled,
                    }}
                  >
                    {getStatusIcon(status?.database)}
                  </ListItemIcon>
                  <ListItemText
                    primary="Database"
                    secondary={getDatabaseStatusText()} // Use helper
                    primaryTypographyProps={{ fontSize: '0.875rem' }}
                    secondaryTypographyProps={{ fontSize: '0.75rem' }}
                  />
                </ListItem>
                <ListItem sx={{ py: 0.5, pl: 4 }}>
                  {/* Pass the whole status.opcua object */}
                  <ListItemIcon
                    sx={{
                      minWidth: 40,
                      color: status?.opcua?.statusColor || theme.palette.text.disabled,
                    }}
                  >
                    {getStatusIcon(status?.opcua)}
                  </ListItemIcon>
                  <ListItemText
                    primary="OPC UA"
                    secondary={getOpcuaStatusText()} // Use helper
                    primaryTypographyProps={{ fontSize: '0.875rem' }}
                    secondaryTypographyProps={{ fontSize: '0.75rem' }}
                  />
                </ListItem>
              </List>
            </Collapse>
          )}

          <Divider sx={{ my: 1 }} />

          {/* Settings */}
          <ListItem disablePadding>
            <ListItemButton
              component={Link}
              to="/settings"
              selected={location.pathname === '/settings'}
              sx={{
                py: 1.5,
                justifyContent: open ? 'flex-start' : 'center',
                '&.Mui-selected': {
                  bgcolor: alpha(theme.palette.primary.main, 0.1),
                  '&:hover': {
                    bgcolor: alpha(theme.palette.primary.main, 0.2),
                  },
                },
              }}
            >
              <ListItemIcon
                sx={{ minWidth: open ? 40 : 'auto', color: theme.palette.text.primary }}
              >
                <SettingsIcon />
              </ListItemIcon>
              {open && <ListItemText primary="Settings" />}
            </ListItemButton>
          </ListItem>

          {/* Help */}
          <ListItem disablePadding>
            <ListItemButton
              component={Link}
              to="/help"
              selected={location.pathname === '/help'}
              sx={{
                py: 1.5,
                justifyContent: open ? 'flex-start' : 'center',
                '&.Mui-selected': {
                  bgcolor: alpha(theme.palette.primary.main, 0.1),
                  '&:hover': {
                    bgcolor: alpha(theme.palette.primary.main, 0.2),
                  },
                },
              }}
            >
              <ListItemIcon
                sx={{ minWidth: open ? 40 : 'auto', color: theme.palette.text.primary }}
              >
                <HelpOutlineIcon />
              </ListItemIcon>
              {open && <ListItemText primary="Help" />}
            </ListItemButton>
          </ListItem>

          {/* Theme toggle */}
          <ListItem disablePadding>
            <Tooltip
              title={`Switch to ${themeMode === 'dark' ? 'light' : 'dark'} mode`}
              placement="right"
            >
              <ListItemButton
                onClick={toggleTheme}
                sx={{
                  py: 1.5,
                  justifyContent: open ? 'flex-start' : 'center',
                }}
              >
                <ListItemIcon
                  sx={{ minWidth: open ? 40 : 'auto', color: theme.palette.text.primary }}
                >
                  {themeMode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
                </ListItemIcon>
                {open && (
                  <ListItemText primary={`${themeMode === 'dark' ? 'Light' : 'Dark'} Mode`} />
                )}
              </ListItemButton>
            </Tooltip>
          </ListItem>
        </List>
      </Box>
    </Drawer>
  );
};

export default ResponsiveSidebar;
