import { useT } from '@/i18n';
import React, { useState, useEffect } from 'react';
import {
  Box,
  IconButton,
  Tooltip,
  Typography,
  CircularProgress,
  Menu,
  MenuItem,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { motion, AnimatePresence } from 'framer-motion';
import { useTimeRangeStore } from '@/stores/useTimeRangeStore';

const intervals = [
  { label: '10s', value: 10000 },
  { label: '30s', value: 30000 },
  { label: '1m', value: 60000 },
  { label: '5m', value: 300000 },
];

const AutoRefreshIndicator: React.FC = () => {
  const t = useT();

  const {
    autoRefresh,
    refreshInterval,
    toggleAutoRefresh,
    setRefreshInterval,
    triggerRefresh,
    lastRefresh,
  } = useTimeRangeStore();
  const [progress, setProgress] = useState(0);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  useEffect(() => {
    if (!autoRefresh) {
      setProgress(0);
      return;
    }

    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min((elapsed / refreshInterval) * 100, 100);
      setProgress(pct);

      if (elapsed >= refreshInterval) {
        triggerRefresh();
        setProgress(0);
      }
    }, 200);

    return () => clearInterval(timer);
  }, [autoRefresh, refreshInterval, triggerRefresh, lastRefresh]);

  const timeSinceRefresh = Math.round((Date.now() - lastRefresh.getTime()) / 1000);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Tooltip title={autoRefresh ? 'Pause auto-refresh' : 'Resume auto-refresh'}>
        <IconButton
          size="small"
          onClick={toggleAutoRefresh}
          sx={{
            position: 'relative',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '8px',
            width: 32,
            height: 32,
          }}
        >
          {autoRefresh && (
            <CircularProgress
              aria-label="Time until the next refresh"
              variant="determinate"
              value={progress}
              size={28}
              thickness={2}
              sx={{
                position: 'absolute',
                color: 'primary.main',
                opacity: 0.6,
              }}
            />
          )}
          <AnimatePresence mode="wait">
            {autoRefresh ? (
              <motion.div
                key="pause"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
              >
                <PauseIcon sx={{ fontSize: 14 }} />
              </motion.div>
            ) : (
              <motion.div
                key="play"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
              >
                <PlayArrowIcon sx={{ fontSize: 14 }} />
              </motion.div>
            )}
          </AnimatePresence>
        </IconButton>
      </Tooltip>

      <Tooltip title={t('Refresh now')}>
        <IconButton
          size="small"
          onClick={triggerRefresh}
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '8px',
            width: 32,
            height: 32,
          }}
        >
          <RefreshIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Tooltip>

      <Tooltip title={t('Change refresh interval')}>
        <Typography
          variant="caption"
          onClick={(e) => setAnchorEl(e.currentTarget as HTMLElement)}
          sx={{
            color: 'text.secondary',
            cursor: 'pointer',
            px: 0.5,
            '&:hover': { color: 'primary.main' },
          }}
        >
          {autoRefresh ? `${refreshInterval / 1000}s` : `${timeSinceRefresh}s ago`}
        </Typography>
      </Tooltip>

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        {intervals.map((item) => (
          <MenuItem
            key={item.value}
            selected={refreshInterval === item.value}
            onClick={() => {
              setRefreshInterval(item.value);
              setAnchorEl(null);
            }}
          >
            {item.label}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
};

export default AutoRefreshIndicator;
