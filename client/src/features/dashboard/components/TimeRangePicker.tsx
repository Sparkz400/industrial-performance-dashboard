import { useT } from '@/i18n';
import React, { useState } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  Popover,
  TextField,
  Typography,
  alpha,
  IconButton,
  Tooltip,
} from '@mui/material';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import { motion } from 'framer-motion';
import { useTimeRangeStore } from '@/stores/useTimeRangeStore';
import type { TimeRangePreset } from '@/types';

const presets: { value: TimeRangePreset; label: string }[] = [
  { value: '1h', label: '1H' },
  { value: '6h', label: '6H' },
  { value: '24h', label: '24H' },
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
];

const TimeRangePicker: React.FC = () => {
  const t = useT();

  const { timeRange, setPreset, setCustomRange } = useTimeRangeStore();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      setCustomRange(new Date(customStart), new Date(customEnd));
      setAnchorEl(null);
    }
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <ButtonGroup
          size="small"
          sx={{
            '& .MuiButton-root': {
              borderRadius: '8px !important',
              px: 1.5,
              py: 0.5,
              fontSize: '0.75rem',
              fontWeight: 600,
              minWidth: 40,
              border: '1px solid',
              borderColor: 'divider',
              '&:not(:last-of-type)': {
                borderRight: '1px solid',
                borderColor: 'divider',
              },
            },
          }}
        >
          {presets.map(({ value, label }) => (
            <Button
              key={value}
              onClick={() => setPreset(value)}
              variant={timeRange.preset === value ? 'contained' : 'outlined'}
              sx={{
                ...(timeRange.preset === value && {
                  bgcolor: 'primary.main',
                  color: '#fff',
                  '&:hover': { bgcolor: 'primary.dark' },
                }),
              }}
            >
              {label}
            </Button>
          ))}
        </ButtonGroup>
      </motion.div>

      <Tooltip title={t('Custom range')}>
        <IconButton
          size="small"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            border: '1px solid',
            borderColor: timeRange.preset === 'custom' ? 'primary.main' : 'divider',
            borderRadius: '8px',
            bgcolor:
              timeRange.preset === 'custom'
                ? (theme) => alpha(theme.palette.primary.main, 0.1)
                : 'transparent',
          }}
        >
          <CalendarTodayIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>

      <Typography variant="caption" sx={{ color: 'text.secondary', ml: 0.5 }}>
        {timeRange.label}
      </Typography>

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 280 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {t('Custom Time Range')}
          </Typography>
          <TextField
            label={t('Start')}
            type="datetime-local"
            size="small"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label={t('End')}
            type="datetime-local"
            size="small"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button variant="contained" size="small" onClick={handleCustomApply}>
            {t('Apply')}
          </Button>
        </Box>
      </Popover>
    </Box>
  );
};

export default TimeRangePicker;
