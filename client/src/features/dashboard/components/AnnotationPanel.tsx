import React, { useState } from 'react';
import { Box, Typography, TextField, IconButton, Tooltip, Collapse, Paper } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import NoteIcon from '@mui/icons-material/StickyNote2';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useAnnotationStore } from '@/stores/useAnnotationStore';

const COLORS = ['#ff9800', '#4caf50', '#2196f3', '#f44336', '#9c27b0', '#00bcd4'];

interface AnnotationPanelProps {
  widgetId: string;
}

const AnnotationPanel: React.FC<AnnotationPanelProps> = ({ widgetId }) => {
  const [expanded, setExpanded] = useState(false);
  const [newText, setNewText] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);

  const annotations = useAnnotationStore((s) => s.annotations).filter(
    (a) => a.widgetId === widgetId,
  );
  const addAnnotation = useAnnotationStore((s) => s.addAnnotation);
  const removeAnnotation = useAnnotationStore((s) => s.removeAnnotation);

  const handleAdd = () => {
    if (!newText.trim()) return;
    addAnnotation(widgetId, newText.trim(), new Date(), selectedColor);
    setNewText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <Box className="no-drag">
      <Tooltip title={`${annotations.length} note${annotations.length !== 1 ? 's' : ''}`}>
        <IconButton
          size="small"
          onClick={() => setExpanded(!expanded)}
          sx={{
            background: annotations.length > 0 ? 'rgba(255,152,0,0.8)' : 'rgba(131,131,131,0.8)',
            '&:hover': {
              background: annotations.length > 0 ? 'rgba(255,152,0,0.9)' : 'rgba(100,100,100,0.9)',
            },
          }}
        >
          <NoteIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Collapse in={expanded}>
        <Paper
          elevation={4}
          sx={{
            position: 'absolute',
            top: 36,
            right: 0,
            width: 280,
            maxHeight: 320,
            zIndex: 20,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <Box
            sx={{
              px: 1.5,
              py: 1,
              borderBottom: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Typography variant="caption" fontWeight={600}>
              Notes ({annotations.length})
            </Typography>
            <IconButton size="small" onClick={() => setExpanded(false)}>
              <ExpandLessIcon fontSize="small" />
            </IconButton>
          </Box>

          {/* Annotations list */}
          <Box sx={{ flexGrow: 1, overflowY: 'auto', maxHeight: 180 }}>
            {annotations.length === 0 ? (
              <Box sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="caption" color="text.disabled">
                  No notes yet
                </Typography>
              </Box>
            ) : (
              annotations.map((ann) => (
                <Box
                  key={ann.id}
                  sx={{
                    px: 1.5,
                    py: 0.75,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Box
                    sx={{
                      width: 4,
                      minHeight: 20,
                      borderRadius: 1,
                      bgcolor: ann.color || '#ff9800',
                      mt: 0.25,
                      flexShrink: 0,
                    }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{ fontSize: '0.75rem', wordBreak: 'break-word' }}
                    >
                      {ann.text}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.disabled"
                      sx={{ fontSize: '0.65rem' }}
                    >
                      {new Date(ann.createdAt).toLocaleString()}
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    onClick={() => removeAnnotation(ann.id)}
                    sx={{ flexShrink: 0 }}
                  >
                    <DeleteIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Box>
              ))
            )}
          </Box>

          {/* Add annotation */}
          <Box sx={{ p: 1, borderTop: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
              {COLORS.map((color) => (
                <Box
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  sx={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    bgcolor: color,
                    cursor: 'pointer',
                    border: selectedColor === color ? '2px solid white' : '2px solid transparent',
                    boxShadow: selectedColor === color ? `0 0 0 1px ${color}` : 'none',
                  }}
                />
              ))}
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <TextField
                size="small"
                placeholder="Add a note..."
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                onKeyDown={handleKeyDown}
                fullWidth
                sx={{ '& .MuiInputBase-input': { fontSize: '0.75rem', py: 0.5 } }}
              />
              <IconButton
                size="small"
                onClick={handleAdd}
                disabled={!newText.trim()}
                color="primary"
              >
                <AddIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
        </Paper>
      </Collapse>
    </Box>
  );
};

export default AnnotationPanel;
