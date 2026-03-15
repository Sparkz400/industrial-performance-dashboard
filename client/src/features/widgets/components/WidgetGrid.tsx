import React from 'react';
import { Avatar, Box, Chip, Typography, alpha } from '@mui/material';
import type { SvgIconProps } from '@mui/material';
import * as MuiIcons from '@mui/icons-material';
import { CATEGORY_COLORS, type CategoryColor } from '../registry/WidgetRegistry';
import type { WidgetMeta } from '@/types';
import { motion } from 'framer-motion';

type WidgetGridItem = WidgetMeta & { type: string };

const resolveIcon = (iconName: string | undefined): React.ComponentType<SvgIconProps> => {
  if (!iconName) return MuiIcons.Widgets;
  const icons = MuiIcons as Record<string, React.ComponentType<SvgIconProps>>;
  // eslint-disable-next-line security/detect-object-injection -- iconName is a known MUI icon name from widget config
  return icons[iconName] || MuiIcons.Widgets;
};

const getCategoryColor = (category: string | undefined): CategoryColor => {
  const key = category || '';
  // eslint-disable-next-line security/detect-object-injection -- category is from a fixed set of widget categories
  return CATEGORY_COLORS[key] || { main: '#90a4ae', light: '#eceff1', dark: '#455a64' };
};

interface WidgetCardProps {
  widget: WidgetGridItem;
  onClick: () => void;
  index?: number;
  draggable?: boolean;
}

const WidgetCard = React.memo<WidgetCardProps>(
  ({ widget, onClick, index = 0, draggable = false }) => {
    const IconComponent = resolveIcon(widget.icon);
    const color = getCategoryColor(widget.category);

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
      if (!draggable) return;
      e.dataTransfer.setData('widgetType', widget.type);
      e.dataTransfer.effectAllowed = 'copy';
    };

    return (
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, delay: index * 0.05 }}
        whileHover={{ y: -4 }}
        whileTap={{ scale: 0.98 }}
      >
        <Box
          onClick={onClick}
          draggable={draggable}
          onDragStart={handleDragStart}
          sx={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
            cursor: draggable ? 'grab' : 'pointer',
            overflow: 'hidden',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            backdropFilter: 'blur(12px)',
            '&:hover': {
              boxShadow: () => `0 8px 24px ${alpha(color.main, 0.25)}`,
              borderColor: color.main,
              '& .widget-card-icon-area': {
                backgroundColor: alpha(color.main, 0.12),
              },
              '& .widget-card-icon': {
                transform: 'scale(1.15) rotate(5deg)',
              },
            },
            '&:active': {
              cursor: draggable ? 'grabbing' : 'pointer',
            },
          }}
        >
          {/* Icon area */}
          <Box
            className="widget-card-icon-area"
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              py: 3.5,
              backgroundColor: alpha(color.main, 0.06),
              transition: 'background-color 0.3s ease',
            }}
          >
            <Avatar
              className="widget-card-icon"
              sx={{
                width: 52,
                height: 52,
                background: `linear-gradient(135deg, ${color.main}, ${alpha(color.main, 0.7)})`,
                transition: 'transform 0.3s ease',
                boxShadow: `0 4px 12px ${alpha(color.main, 0.3)}`,
              }}
            >
              <IconComponent sx={{ fontSize: 26, color: '#fff' }} />
            </Avatar>
          </Box>

          {/* Content area */}
          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 0.5,
              }}
            >
              <Typography
                variant="subtitle1"
                sx={{
                  fontWeight: 600,
                  lineHeight: 1.3,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 'calc(100% - 80px)',
                }}
              >
                {widget.title || widget.type}
              </Typography>
              <Chip
                label={widget.category || 'Misc'}
                size="small"
                sx={{
                  height: 22,
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  backgroundColor: alpha(color.main, 0.12),
                  color: color.main,
                  border: `1px solid ${alpha(color.main, 0.25)}`,
                }}
              />
            </Box>

            {widget.description && (
              <Typography
                variant="body2"
                sx={{
                  color: 'text.secondary',
                  lineHeight: 1.4,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  mb: 1,
                }}
              >
                {widget.description}
              </Typography>
            )}

            <Box
              sx={{
                mt: 'auto',
                pt: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
                {widget.settingsComponent ? 'Configurable' : ''}
              </Typography>
              {widget.defaultW && widget.defaultH && (
                <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
                  {widget.defaultW}&times;{widget.defaultH}
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
      </motion.div>
    );
  },
);
WidgetCard.displayName = 'WidgetCard';

interface WidgetGridProps {
  widgets: WidgetGridItem[];
  onSelectWidget: (widgetType: string) => void;
  isLoading?: boolean;
  enableDragDrop?: boolean;
}

const WidgetGrid: React.FC<WidgetGridProps> = ({
  widgets,
  onSelectWidget,
  isLoading,
  enableDragDrop = false,
}) => {
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <Typography color="text.secondary">Loading widgets...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, 1fr)',
            md: 'repeat(3, 1fr)',
            lg: 'repeat(4, 1fr)',
          },
          gap: 2,
        }}
      >
        {widgets.map((widget, index) => (
          <WidgetCard
            key={widget.type}
            widget={widget}
            index={index}
            onClick={() => onSelectWidget(widget.type)}
            draggable={enableDragDrop}
          />
        ))}
      </Box>
    </Box>
  );
};

export default WidgetGrid;
