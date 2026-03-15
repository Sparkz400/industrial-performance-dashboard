import React, { useState, useMemo } from 'react';
import {
  Drawer,
  Typography,
  TextField,
  Box,
  InputAdornment,
  IconButton,
  Chip,
  alpha,
  Divider,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import WidgetsIcon from '@mui/icons-material/Widgets';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { motion, AnimatePresence } from 'framer-motion';

import {
  widgetRegistry,
  getWidgetsByCategory,
  CATEGORY_COLORS,
  type CategoryColor,
} from '../registry/WidgetRegistry';
import type { WidgetMeta } from '@/types';
import WidgetGrid from './WidgetGrid';

const DRAWER_WIDTH = 820;

type WidgetGridItem = WidgetMeta & { type: string };

interface WidgetPreviewPopupProps {
  open: boolean;
  onClose: () => void;
  onSelect: (widgetType: string) => void;
}

const WidgetPreviewPopup: React.FC<WidgetPreviewPopupProps> = ({ open, onClose, onSelect }) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<string>('All');

  const categorizedWidgets = useMemo((): Record<string, WidgetGridItem[]> => {
    const categories = getWidgetsByCategory();
    const allWidgets: WidgetGridItem[] = Object.entries(widgetRegistry).map(([key, widget]) => ({
      type: key,
      ...widget,
    }));
    return { All: allWidgets, ...categories };
  }, []);

  const categoryNames = useMemo(() => Object.keys(categorizedWidgets), [categorizedWidgets]);

  const filteredWidgets = useMemo((): Record<string, WidgetGridItem[]> => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return categorizedWidgets;

    const filtered: Record<string, WidgetGridItem[]> = {};
    Object.entries(categorizedWidgets).forEach(([category, widgets]) => {
      // eslint-disable-next-line security/detect-object-injection -- category comes from Object.entries keys
      filtered[category] = widgets.filter(
        (widget) =>
          widget.title?.toLowerCase().includes(query) ||
          widget.description?.toLowerCase().includes(query) ||
          widget.type.toLowerCase().includes(query) ||
          widget.category?.toLowerCase().includes(query),
      );
    });
    return filtered;
  }, [categorizedWidgets, searchQuery]);

  // eslint-disable-next-line security/detect-object-injection -- activeCategory is from a controlled state variable
  const currentWidgets: WidgetGridItem[] = filteredWidgets[activeCategory] || [];

  const handleClose = (): void => {
    setSearchQuery('');
    setActiveCategory('All');
    onClose();
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={handleClose}
      PaperProps={{
        sx: {
          width: { xs: '100vw', sm: DRAWER_WIDTH },
          maxWidth: '100vw',
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 3,
          pt: 3,
          pb: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <motion.div
            initial={{ rotate: 0 }}
            animate={{ rotate: open ? 360 : 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            <WidgetsIcon sx={{ color: 'primary.main', fontSize: 28 }} />
          </motion.div>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              Widget Library
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {Object.keys(widgetRegistry).length} widgets available - drag or click to add
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={handleClose} size="small" aria-label="close widget library">
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Drag hint */}
      <Box
        sx={{
          px: 3,
          py: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          bgcolor: (theme) => alpha(theme.palette.info.main, 0.06),
        }}
      >
        <DragIndicatorIcon sx={{ fontSize: 16, color: 'info.main' }} />
        <Typography variant="caption" color="info.main" sx={{ fontWeight: 500 }}>
          Drag widgets onto the dashboard or click to add at the bottom
        </Typography>
      </Box>

      {/* Search */}
      <Box sx={{ px: 3, py: 2 }}>
        <TextField
          placeholder="Search by name, description, or category..."
          value={searchQuery}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
          variant="outlined"
          size="small"
          fullWidth
          autoFocus
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: 'text.disabled' }} />
              </InputAdornment>
            ),
            endAdornment: searchQuery ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearchQuery('')} edge="end">
                  <CloseIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : null,
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 2.5,
            },
          }}
        />
      </Box>

      {/* Category filter chips */}
      <Box sx={{ px: 3, pb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {categoryNames.map((category) => {
          const isActive = activeCategory === category;
          // eslint-disable-next-line security/detect-object-injection -- category from categoryNames iteration
          const count = filteredWidgets[category]?.length || 0;
          // eslint-disable-next-line security/detect-object-injection -- category from categoryNames iteration
          const color: CategoryColor | undefined = CATEGORY_COLORS[category];

          return (
            <motion.div key={category} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Chip
                label={`${category} (${count})`}
                size="small"
                onClick={() => setActiveCategory(category)}
                sx={{
                  fontWeight: isActive ? 600 : 400,
                  borderRadius: '8px',
                  transition: 'all 0.2s ease',
                  ...(isActive && color
                    ? {
                        backgroundColor: alpha(color.main, 0.15),
                        color: color.main,
                        border: `1px solid ${alpha(color.main, 0.4)}`,
                      }
                    : isActive
                      ? {
                          backgroundColor: 'primary.main',
                          color: 'primary.contrastText',
                        }
                      : {
                          backgroundColor: 'action.hover',
                          color: 'text.secondary',
                          border: '1px solid transparent',
                          '&:hover': {
                            backgroundColor: 'action.selected',
                          },
                        }),
                }}
              />
            </motion.div>
          );
        })}
      </Box>

      <Divider />

      {/* Widget grid with drag support */}
      <Box sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <AnimatePresence mode="wait">
          {currentWidgets.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Box sx={{ p: 6, textAlign: 'center' }}>
                <WidgetsIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography color="text.secondary" variant="body1">
                  {searchQuery
                    ? `No widgets match "${searchQuery}"`
                    : 'No widgets in this category.'}
                </Typography>
                {searchQuery && (
                  <Typography
                    variant="body2"
                    color="primary"
                    sx={{ mt: 1, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                    onClick={() => {
                      setSearchQuery('');
                      setActiveCategory('All');
                    }}
                  >
                    Clear search and show all
                  </Typography>
                )}
              </Box>
            </motion.div>
          ) : (
            <motion.div
              key={activeCategory + searchQuery}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <WidgetGrid
                widgets={currentWidgets}
                onSelectWidget={(widgetType: string) => {
                  onSelect(widgetType);
                  handleClose();
                }}
                enableDragDrop={true}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </Box>
    </Drawer>
  );
};

export default WidgetPreviewPopup;
