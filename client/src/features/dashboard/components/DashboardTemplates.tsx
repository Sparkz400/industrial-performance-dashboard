import React from 'react';
import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  Typography,
  alpha,
  IconButton,
  Chip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DashboardIcon from '@mui/icons-material/Dashboard';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import BuildIcon from '@mui/icons-material/Build';
import { motion } from 'framer-motion';
import type { DashboardTemplate } from '@/types';

const templates: DashboardTemplate[] = [
  {
    id: 'template-overview',
    name: 'Overview Dashboard',
    description:
      'A general-purpose dashboard with system status, alarms, and key metrics at a glance.',
    icon: 'Dashboard',
    category: 'General',
    widgets: [
      {
        id: 'w-1',
        type: 'systemStatus',
        config: { autoRefresh: true, showDetails: true, refreshInterval: 20000 },
      },
      { id: 'w-2', type: 'alarmDashboard', config: { rowsPerPage: 5 } },
      { id: 'w-3', type: 'upTimeRate', config: { expectedUptime: 99 } },
    ],
    layout: [
      { i: 'w-1', x: 0, y: 0, w: 4, h: 6, minW: 2, minH: 2 },
      { i: 'w-2', x: 4, y: 0, w: 8, h: 6, minW: 2, minH: 2 },
      { i: 'w-3', x: 0, y: 6, w: 6, h: 8, minW: 2, minH: 2 },
    ],
  },
  {
    id: 'template-monitoring',
    name: 'Monitoring Station',
    description: 'Focus on real-time monitoring with air consumption, system status, and alarms.',
    icon: 'MonitorHeart',
    category: 'Monitoring',
    widgets: [
      {
        id: 'w-1',
        type: 'systemStatus',
        config: { autoRefresh: true, showDetails: true, refreshInterval: 10000 },
      },
      { id: 'w-2', type: 'currentAirConsumptionWidget', config: {} },
      { id: 'w-3', type: 'alarmDashboard', config: { rowsPerPage: 10 } },
    ],
    layout: [
      { i: 'w-1', x: 0, y: 0, w: 4, h: 6, minW: 2, minH: 2 },
      { i: 'w-2', x: 4, y: 0, w: 8, h: 8, minW: 2, minH: 2 },
      { i: 'w-3', x: 0, y: 8, w: 12, h: 6, minW: 2, minH: 2 },
    ],
  },
  {
    id: 'template-analytics',
    name: 'Analytics Center',
    description:
      'Deep dive into operational analytics with mode tracking, uptime, and distributions.',
    icon: 'Analytics',
    category: 'Analytics',
    widgets: [
      { id: 'w-1', type: 'operationMode', config: { maxPoints: 120, showBrush: true } },
      { id: 'w-2', type: 'operationModePie', config: {} },
      { id: 'w-3', type: 'upTimeRate', config: { expectedUptime: 99 } },
    ],
    layout: [
      { i: 'w-1', x: 0, y: 0, w: 6, h: 8, minW: 2, minH: 2 },
      { i: 'w-2', x: 6, y: 0, w: 6, h: 8, minW: 2, minH: 2 },
      { i: 'w-3', x: 0, y: 8, w: 12, h: 8, minW: 2, minH: 2 },
    ],
  },
  {
    id: 'template-maintenance',
    name: 'Maintenance View',
    description: 'Focused on system health, alarms, and air consumption for maintenance teams.',
    icon: 'Build',
    category: 'Operations',
    widgets: [
      { id: 'w-1', type: 'alarmDashboard', config: { rowsPerPage: 10 } },
      {
        id: 'w-2',
        type: 'systemStatus',
        config: { autoRefresh: true, showDetails: true, refreshInterval: 15000 },
      },
      { id: 'w-3', type: 'currentAirConsumptionWidget', config: {} },
    ],
    layout: [
      { i: 'w-1', x: 0, y: 0, w: 8, h: 8, minW: 2, minH: 2 },
      { i: 'w-2', x: 8, y: 0, w: 4, h: 8, minW: 2, minH: 2 },
      { i: 'w-3', x: 0, y: 8, w: 12, h: 8, minW: 2, minH: 2 },
    ],
  },
];

const iconMap: Record<string, React.ReactNode> = {
  Dashboard: <DashboardIcon sx={{ fontSize: 32 }} />,
  MonitorHeart: <MonitorHeartIcon sx={{ fontSize: 32 }} />,
  Analytics: <AnalyticsIcon sx={{ fontSize: 32 }} />,
  Build: <BuildIcon sx={{ fontSize: 32 }} />,
};

const categoryColors: Record<string, string> = {
  General: '#B83D0C',
  Monitoring: '#F44336',
  Analytics: '#527783',
  Operations: '#FF9800',
};

interface DashboardTemplatesProps {
  open: boolean;
  onClose: () => void;
  onApplyTemplate: (template: DashboardTemplate) => void;
}

const DashboardTemplates: React.FC<DashboardTemplatesProps> = ({
  open,
  onClose,
  onApplyTemplate,
}) => (
  <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
    <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Dashboard Templates
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Start with a pre-built layout
        </Typography>
      </Box>
      <IconButton onClick={onClose} size="small">
        <CloseIcon />
      </IconButton>
    </DialogTitle>
    <DialogContent>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
          gap: 2,
          pb: 2,
        }}
      >
        {templates.map((template, index) => {
          const color = categoryColors[template.category] || '#B83D0C';
          return (
            <motion.div
              key={template.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.08 }}
            >
              <Box
                onClick={() => {
                  onApplyTemplate(template);
                  onClose();
                }}
                sx={{
                  p: 2.5,
                  borderRadius: 3,
                  border: '1px solid',
                  borderColor: 'divider',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    borderColor: color,
                    transform: 'translateY(-4px)',
                    boxShadow: () => `0 8px 24px ${alpha(color, 0.2)}`,
                    '& .template-icon': {
                      transform: 'scale(1.1)',
                      bgcolor: alpha(color, 0.15),
                    },
                  },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Box
                    className="template-icon"
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 56,
                      height: 56,
                      borderRadius: 2.5,
                      bgcolor: alpha(color, 0.08),
                      color,
                      transition: 'all 0.3s ease',
                      flexShrink: 0,
                    }}
                  >
                    {iconMap[template.icon] || <DashboardIcon sx={{ fontSize: 32 }} />}
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        {template.name}
                      </Typography>
                      <Chip
                        label={template.category}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: '0.65rem',
                          bgcolor: alpha(color, 0.1),
                          color,
                        }}
                      />
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                      {template.description}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.disabled"
                      sx={{ mt: 1, display: 'block' }}
                    >
                      {template.widgets.length} widgets
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </motion.div>
          );
        })}
      </Box>
    </DialogContent>
  </Dialog>
);

export { templates };
export default DashboardTemplates;
