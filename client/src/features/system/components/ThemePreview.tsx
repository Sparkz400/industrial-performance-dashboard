import React from 'react';
import { Box, Typography, Button, Chip, Paper, Switch, TextField, IconButton } from '@mui/material';
import FavoriteIcon from '@mui/icons-material/Favorite';
import DeleteIcon from '@mui/icons-material/Delete';

interface ThemePreviewProps {
  mode: 'light' | 'dark';
}

/**
 * Component to preview theme styles
 * @param root0
 * @param root0.mode
 */
const ThemePreview: React.FC<ThemePreviewProps> = ({ mode }) => (
  <Paper
    elevation={3}
    sx={{
      p: 2,
      mt: 2,
      bgcolor: 'background.paper',
      color: 'text.primary',
    }}
  >
    <Typography variant="h6" gutterBottom>
      Theme Preview
    </Typography>

    <Box sx={{ mb: 2 }}>
      <Typography variant="body2" gutterBottom>
        This is how the {mode} theme looks.
      </Typography>

      <Typography variant="subtitle1" gutterBottom>
        Typography
      </Typography>
      <Typography variant="body1" gutterBottom>
        Body text
      </Typography>
      <Typography variant="caption" display="block" gutterBottom>
        Caption text
      </Typography>
    </Box>

    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle1" gutterBottom>
        Buttons
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
        <Button variant="contained" color="primary">
          Primary
        </Button>
        <Button variant="contained" color="secondary">
          Secondary
        </Button>
        <Button variant="contained" color="error">
          Error
        </Button>
      </Box>

      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button variant="outlined" color="primary">
          Outlined
        </Button>
        <Button variant="text" color="secondary">
          Text
        </Button>
        <IconButton color="primary" aria-label="like">
          <FavoriteIcon />
        </IconButton>
        <IconButton color="error" aria-label="delete">
          <DeleteIcon />
        </IconButton>
      </Box>
    </Box>

    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle1" gutterBottom>
        Components
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <TextField label="Input Field" variant="outlined" size="small" defaultValue="Sample text" />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Switch defaultChecked />
          <Typography variant="body2">Toggle switch</Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Chip label="Chip" color="primary" />
          <Chip label="Deletable" color="secondary" onDelete={() => {}} />
          <Chip label="Disabled" disabled />
        </Box>
      </Box>
    </Box>
  </Paper>
);

export default ThemePreview;
