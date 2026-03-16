import React, { useState, type FormEvent } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
} from '@mui/material';
import { Visibility, VisibilityOff, Lock } from '@mui/icons-material';
import { motion } from 'framer-motion';
import { useAuthStore } from '../../../stores/useAuthStore';

/**
 *
 */
export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const { login, isLoading, error, clearError } = useAuthStore();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    try {
      await login(username, password);
    } catch {
      // Error is handled by the store
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Card
          sx={{
            width: 400,
            maxWidth: '100%',
            boxShadow: 8,
          }}
        >
          <CardContent sx={{ p: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 3 }}>
              <Box
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: '16px',
                  background: 'linear-gradient(135deg, #6C63FF, #FF6B9D)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 2,
                }}
              >
                <Lock sx={{ color: '#fff', fontSize: 28 }} />
              </Box>
              <Typography variant="h5" fontWeight={700}>
                Performance Dashboard
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Sign in to continue
              </Typography>
            </Box>

            {error && (
              <Alert severity="error" onClose={clearError} sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Box component="form" onSubmit={handleSubmit} noValidate>
              <TextField
                label="Username"
                fullWidth
                required
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                sx={{ mb: 2 }}
                disabled={isLoading}
              />
              <TextField
                label="Password"
                type={showPassword ? 'text' : 'password'}
                fullWidth
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                sx={{ mb: 3 }}
                disabled={isLoading}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                          size="small"
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <Button
                type="submit"
                variant="contained"
                fullWidth
                size="large"
                disabled={isLoading || !username.trim() || !password.trim()}
                sx={{
                  py: 1.5,
                  fontWeight: 600,
                  background: 'linear-gradient(135deg, #6C63FF, #FF6B9D)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #5A52E0, #E05A8A)',
                  },
                }}
              >
                {isLoading ? <CircularProgress size={24} color="inherit" /> : 'Sign In'}
              </Button>
            </Box>
          </CardContent>
        </Card>
      </motion.div>
    </Box>
  );
}
