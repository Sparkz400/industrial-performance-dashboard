import React from 'react';
import { Box, Typography, alpha, useTheme } from '@mui/material';
import { motion } from 'framer-motion';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import SpeedIcon from '@mui/icons-material/Speed';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { useStatusStore } from '@/stores/useStatusStore';

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  delay?: number;
}

const KpiCard: React.FC<KpiCardProps> = ({ label, value, icon, color, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 20, scale: 0.95 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ duration: 0.4, delay }}
    style={{ flex: 1 }}
  >
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        py: 1.5,
        px: 2,
        borderRadius: 1,
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        boxShadow: 'inset 0 1px var(--industrial-shine), 0 2px 3px #00000012',
        transition: 'all 0.3s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: () => `0 4px 16px ${alpha(color, 0.2)}`,
        },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          borderRadius: 2,
          bgcolor: alpha(color, 0.15),
          color,
        }}
      >
        {icon}
      </Box>
      <Box>
        <Typography
          variant="caption"
          sx={{ color: 'text.secondary', fontWeight: 500, lineHeight: 1 }}
        >
          {label}
        </Typography>
        <Typography
          variant="subtitle1"
          sx={{ fontWeight: 700, lineHeight: 1.3, color: 'text.primary' }}
        >
          {value}
        </Typography>
      </Box>
    </Box>
  </motion.div>
);

const KpiSummaryBar: React.FC = () => {
  const theme = useTheme();
  const status = useStatusStore((s) => s.status);
  const isConnected = useStatusStore((s) => s.isConnected);
  const isError = useStatusStore((s) => s.isError);

  const systemHealth =
    status?.overall?.status === 'UNKNOWN'
      ? 'Unknown'
      : isConnected
        ? 'Healthy'
        : isError
          ? 'Error'
          : 'Degraded';
  const systemColor = isConnected
    ? theme.palette.success.main
    : isError
      ? theme.palette.error.main
      : theme.palette.warning.main;

  const dbStatus = status?.database?.statusText || 'Unknown';
  const dbColor =
    status?.database?.status === 'CONNECTED' || status?.database?.status === 'OK'
      ? theme.palette.success.main
      : theme.palette.error.main;

  const opcuaStatus = status?.opcua?.statusText || 'Unknown';
  const opcuaColor =
    status?.opcua?.status === 'CONNECTED' || status?.opcua?.status === 'OK'
      ? theme.palette.success.main
      : theme.palette.error.main;

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1.5,
        px: 2,
        py: 1,
        overflowX: 'auto',
        '&::-webkit-scrollbar': { display: 'none' },
      }}
    >
      <KpiCard
        label="System"
        value={systemHealth}
        icon={
          isConnected ? (
            <CheckCircleOutlineIcon sx={{ fontSize: 20 }} />
          ) : (
            <WarningAmberIcon sx={{ fontSize: 20 }} />
          )
        }
        color={systemColor}
        delay={0}
      />
      <KpiCard
        label="Database"
        value={dbStatus}
        icon={<SpeedIcon sx={{ fontSize: 20 }} />}
        color={dbColor}
        delay={0.05}
      />
      <KpiCard
        label="OPC UA"
        value={opcuaStatus}
        icon={<AccessTimeIcon sx={{ fontSize: 20 }} />}
        color={opcuaColor}
        delay={0.1}
      />
    </Box>
  );
};

export default KpiSummaryBar;
