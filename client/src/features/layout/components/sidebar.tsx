import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  BottomNavigation,
  BottomNavigationAction,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import FactoryIcon from '@mui/icons-material/Factory';
import BuildIcon from '@mui/icons-material/Build';
import SettingsIcon from '@mui/icons-material/Settings';
import NotificationsIcon from '@mui/icons-material/Notifications';
import MenuIcon from '@mui/icons-material/Menu';
import HelpIcon from '@mui/icons-material/HelpOutlined';
import ContrastIcon from '@mui/icons-material/Contrast';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuthStore } from '@/stores/useAuthStore';
import { useStatusStore } from '@/stores/useStatusStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { usePWA } from '@/hooks/usePWA';
import { useLanguage, useT } from '@/i18n';
import { statusColor, systemObservation } from '@/utils/serviceStatus';
interface Props {
  open: boolean;
  onToggle: () => void;
  onWidthChange: (width: number) => void;
}
/**
 *
 * @param root0
 * @param root0.open
 * @param root0.onToggle
 * @param root0.onWidthChange
 */
export default function ResponsiveSidebar({ open, onToggle, onWidthChange }: Props) {
  const t = useT(),
    location = useLocation(),
    mobile = useMediaQuery('(max-width:1099px)'),
    user = useAuthStore((s) => s.user),
    logout = useAuthStore((s) => s.logout),
    admin = user?.role === 'admin';
  const { language, setLanguage } = useLanguage(),
    toggleTheme = useThemeStore((s) => s.toggleTheme),
    status = useStatusStore((s) => s.status),
    socket = useStatusStore((s) => s.socketConnected);
  const { canInstall, promptInstall } = usePWA();
  const width = mobile ? '100%' : open ? 224 : 56;
  const overall = systemObservation(status);
  useEffect(() => onWidthChange(mobile ? 0 : open ? 224 : 56), [open, mobile, onWidthChange]);
  const links = [
    { to: '/', label: 'Overview', icon: <DashboardIcon /> },
    { to: '/production', label: 'Production', icon: <FactoryIcon /> },
    { to: '/operations', label: 'Daily operations', icon: <BuildIcon /> },
    { to: '/alerts/history', label: 'Alerts', icon: <NotificationsIcon /> },
    ...(admin
      ? [
          { to: '/machines', label: 'Machines', icon: <FactoryIcon /> },
          { to: '/settings', label: 'Settings', icon: <SettingsIcon /> },
        ]
      : []),
    { to: '/dashboards', label: 'Dashboards', icon: <DashboardIcon /> },
    { to: '/wallboard', label: 'Wallboard', icon: <DashboardIcon /> },
    { to: '/help', label: 'Help', icon: <HelpIcon /> },
  ];
  const groups = [
    {
      name: t('Assets', 'Anlagen'),
      links: [
        ['/plants', 'Plants'],
        ['/digital-twins', 'Digital Twins'],
      ],
    },
    {
      name: t('Alerts'),
      links: [
        ['/alerts/rules', 'Alert Rules'],
        ['/alerts/channels', 'Notification Channels'],
      ],
    },
    {
      name: t('Reports'),
      links: [
        ['/reports/templates', 'Report Templates'],
        ['/reports/schedules', 'Report Schedules'],
        ['/reports/history', 'Report History'],
      ],
    },
    {
      name: t('Quality', 'Qualität'),
      links: [
        ['/oee/config', 'OEE Config'],
        ['/spc', 'SPC Profiles'],
        ['/compliance', 'Compliance'],
        ['/recipes', 'Process specifications'],
        ['/batches', 'Batches'],
      ],
    },
  ];
  const bottomLinks = [
    links[0],
    ...(admin ? [links.find((link) => link.to === '/machines')!] : [links[1]]),
    links[2],
  ];
  const navigate = () => {
    if (mobile && open) onToggle();
  };
  return (
    <>
      <Drawer
        variant={mobile ? 'temporary' : 'permanent'}
        open={open}
        onClose={onToggle}
        slotProps={{ paper: { sx: { width, overflowX: 'hidden' } } }}
      >
        <Box
          component="nav"
          aria-label={t('Main navigation', 'Hauptnavigation')}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100%',
            p: 0.5,
            '& .Mui-selected .MuiListItemText-primary': { fontWeight: 600 },
          }}
        >
          <IconButton
            aria-label={t(open ? 'Close navigation' : 'Expand navigation')}
            aria-expanded={open}
            onClick={onToggle}
            sx={{ width: 48, height: 48, alignSelf: 'flex-start' }}
          >
            <MenuIcon />
          </IconButton>
          {open && (
            <Typography sx={{ px: 1.5, py: 1, fontWeight: 700 }}>Performance Dashboard</Typography>
          )}
          <List>
            {links.map((link) => (
              <ListItem key={link.to} disablePadding>
                <Tooltip title={open ? '' : t(link.label)} placement="right">
                  <ListItemButton
                    component={Link}
                    to={link.to}
                    aria-label={t(link.label)}
                    aria-current={location.pathname === link.to ? 'page' : undefined}
                    selected={location.pathname === link.to}
                    onClick={navigate}
                    sx={{ minHeight: 48, px: 1.5, borderRadius: 1 }}
                  >
                    <ListItemIcon sx={{ minWidth: open ? 36 : 24 }}>{link.icon}</ListItemIcon>
                    {open && <ListItemText primary={t(link.label)} />}
                  </ListItemButton>
                </Tooltip>
              </ListItem>
            ))}
          </List>
          {admin &&
            open &&
            groups.map((group) => (
              <Box
                component="details"
                key={group.name}
                open={group.links.some(([to]) => location.pathname === to)}
              >
                <Typography
                  component="summary"
                  variant="subtitle2"
                  color="text.secondary"
                  sx={{ px: 2, py: 1.5, cursor: 'pointer', minHeight: 44 }}
                >
                  {group.name}
                </Typography>
                <List aria-label={group.name} dense>
                  {group.links.map(([to, label]) => (
                    <ListItem key={to} disablePadding>
                      <ListItemButton
                        component={Link}
                        to={to}
                        onClick={navigate}
                        selected={location.pathname === to}
                        aria-current={location.pathname === to ? 'page' : undefined}
                        sx={{ minHeight: 44 }}
                      >
                        <ListItemText primary={t(label)} />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </Box>
            ))}
          <Box sx={{ flexGrow: 1 }} />
          <Divider sx={{ my: 1 }} />
          {admin && open && (
            <Box sx={{ p: 1.5 }}>
              <Typography variant="caption">{t('System Status')}</Typography>
              <Chip
                size="small"
                label={t(overall.statusText)}
                color={statusColor(overall.status)}
              />
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                }}
              >
                {socket
                  ? t('Browser link: live', 'Browser-Verbindung: live')
                  : t('Polling', 'Regelmäßige Abfrage')}
              </Typography>
            </Box>
          )}
          {open && (
            <TextField
              select
              size="small"
              label="Language / Sprache"
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'en' | 'de')}
              sx={{ my: 1, mx: 0.5 }}
            >
              <MenuItem value="en">English</MenuItem>
              <MenuItem value="de">Deutsch</MenuItem>
            </TextField>
          )}
          <Tooltip title={t('Toggle theme')}>
            <ListItemButton
              aria-label={t('Toggle theme')}
              onClick={toggleTheme}
              sx={{ minHeight: 48, px: 1.5 }}
            >
              <ListItemIcon sx={{ minWidth: open ? 36 : 24 }}>
                <ContrastIcon />
              </ListItemIcon>
              {open && <ListItemText primary={t('Toggle theme')} />}
            </ListItemButton>
          </Tooltip>
          {canInstall && open && (
            <Button onClick={() => void promptInstall()}>{t('Install app')}</Button>
          )}
          {open && (
            <Typography sx={{ p: 1, overflowWrap: 'anywhere' }} variant="body2">
              {user?.username} ·{' '}
              {t(
                user?.role ?? '',
                {
                  admin: 'Administration',
                  supervisor: 'Schichtleitung',
                  operator: 'Bedienung',
                  viewer: 'Lesen',
                  wallboard: 'Wandanzeige',
                }[user?.role ?? 'viewer'],
              )}
            </Typography>
          )}
          <Tooltip title={t('Sign Out')}>
            <ListItemButton
              aria-label={t('Sign Out')}
              onClick={() => void logout()}
              sx={{ minHeight: 48, px: 1.5 }}
            >
              <ListItemIcon sx={{ minWidth: open ? 36 : 24 }}>
                <LogoutIcon />
              </ListItemIcon>
              {open && <ListItemText primary={t('Sign Out')} />}
            </ListItemButton>
          </Tooltip>
        </Box>
      </Drawer>
      {mobile && (
        <BottomNavigation
          showLabels
          value={
            open
              ? 'more'
              : bottomLinks.some((link) => link.to === location.pathname)
                ? location.pathname
                : 'more'
          }
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            height: 'calc(64px + env(safe-area-inset-bottom))',
            pb: 'env(safe-area-inset-bottom)',
            zIndex: 1200,
            bgcolor: 'background.paper',
            borderTop: 1,
            borderColor: 'divider',
            '@media print': { display: 'none' },
          }}
        >
          {bottomLinks.map((link) => (
            <BottomNavigationAction
              key={link.to}
              component={Link}
              to={link.to}
              value={link.to}
              label={t(
                link.to === '/'
                  ? 'Overview'
                  : link.to === '/operations'
                    ? 'Operations'
                    : link.label,
              )}
              icon={link.icon}
              sx={{ minWidth: 0 }}
            />
          ))}
          <BottomNavigationAction
            value="more"
            label={t('More', 'Mehr')}
            icon={<MenuIcon />}
            onClick={onToggle}
            aria-expanded={open}
            sx={{ minWidth: 0 }}
          />
        </BottomNavigation>
      )}
    </>
  );
}
