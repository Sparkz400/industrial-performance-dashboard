import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  Drawer,
  IconButton,
  List,
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
import HelpIcon from '@mui/icons-material/HelpOutline';
import ContrastIcon from '@mui/icons-material/Contrast';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuthStore } from '@/stores/useAuthStore';
import { useStatusStore } from '@/stores/useStatusStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { usePWA } from '@/hooks/usePWA';
import { useLanguage, useT } from '@/i18n';
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
    mobile = useMediaQuery('(max-width:599px)'),
    user = useAuthStore((s) => s.user),
    logout = useAuthStore((s) => s.logout),
    admin = user?.role === 'admin';
  const { language, setLanguage } = useLanguage(),
    toggleTheme = useThemeStore((s) => s.toggleTheme),
    status = useStatusStore((s) => s.status),
    socket = useStatusStore((s) => s.socketConnected);
  const [advanced, setAdvanced] = useState(false),
    { canInstall, promptInstall } = usePWA();
  const width = open ? 260 : 56;
  useEffect(() => onWidthChange(mobile ? 56 : width), [width, mobile, onWidthChange]);
  const links = [
    { to: '/', label: 'Dashboard', icon: <DashboardIcon /> },
    { to: '/production', label: 'Production', icon: <FactoryIcon /> },
    { to: '/operations', label: 'Daily operations', icon: <BuildIcon /> },
    { to: '/alerts/history', label: 'Alerts', icon: <NotificationsIcon /> },
    ...(admin
      ? [
          { to: '/machines', label: 'Machines', icon: <FactoryIcon /> },
          { to: '/settings', label: 'Settings', icon: <SettingsIcon /> },
        ]
      : []),
    { to: '/help', label: 'Help', icon: <HelpIcon /> },
  ];
  const advancedLinks = [
    ['/plants', 'Plants'],
    ['/oee/config', 'OEE Config'],
    ['/reports/history', 'Reports'],
    ['/compliance', 'Compliance'],
    ['/spc', 'SPC Profiles'],
    ['/digital-twins', 'Digital Twins'],
  ];
  const navigate = () => {
    if (mobile && open) onToggle();
  };
  return (
    <Drawer
      variant={mobile && open ? 'temporary' : 'permanent'}
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
          <Typography sx={{ px: 1, py: 1, fontWeight: 700 }}>Performance Dashboard</Typography>
        )}
        <List>
          {links.map((link) => (
            <Tooltip key={link.to} title={open ? '' : t(link.label)} placement="right">
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
          ))}
        </List>
        {admin && open && (
          <>
            <Button
              aria-expanded={advanced}
              aria-controls="advanced-navigation"
              onClick={() => setAdvanced((v) => !v)}
            >
              {t('Advanced')}
            </Button>
            <Collapse in={advanced}>
              <List id="advanced-navigation">
                {advancedLinks.map(([to, label]) => (
                  <ListItemButton
                    key={to}
                    component={Link}
                    to={to}
                    onClick={navigate}
                    selected={location.pathname === to}
                    sx={{ minHeight: 48 }}
                  >
                    <ListItemText primary={t(label)} />
                  </ListItemButton>
                ))}
              </List>
            </Collapse>
          </>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <Divider sx={{ my: 1 }} />
        {admin && open && (
          <Box sx={{ p: 1 }}>
            <Typography variant="caption">{t('System Status')}</Typography>
            <Chip
              size="small"
              label={status.overall.statusText || t('Unknown')}
              color={status.overall.status === 'ERROR' ? 'error' : 'default'}
            />
            <Typography variant="caption" display="block">
              {socket
                ? t('Live connection', 'Live-Verbindung')
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
  );
}
