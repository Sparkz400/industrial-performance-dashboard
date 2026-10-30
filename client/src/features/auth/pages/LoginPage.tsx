import { translate as t, useLanguage } from '@/i18n';
import React, { useEffect, useState, type FormEvent } from 'react';
import { API_BASE_URL } from '@/config/config';
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
  MenuItem,
} from '@mui/material';
import { Visibility, VisibilityOff, Lock } from '@mui/icons-material';
import { motion } from 'framer-motion';
import { useAuthStore } from '../../../stores/useAuthStore';

/**
 *
 */
export default function LoginPage() {
  useLanguage((s) => s.language);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const { login, isLoading, error, clearError } = useAuthStore();
  const [sso, setSso] = useState<{
    enabled: boolean;
    displayName: string;
    error: string | null;
  } | null>(null);
  useEffect(() => {
    // The server reports a failed single sign-on once, instead of putting it in the URL.
    fetch(`${API_BASE_URL}/auth/oidc/config`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setSso)
      .catch(() => setSso(null));
  }, []);

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
            width: 'min(400px, calc(100vw - 32px))',
            maxWidth: '100%',
            boxShadow: 'inset 0 1px var(--industrial-shine), 0 3px 8px #00000018',
          }}
        >
          <CardContent sx={{ p: 4 }}>
            <TextField
              select
              fullWidth
              size="small"
              label="Language / Sprache"
              value={useLanguage.getState().language}
              onChange={(e) => useLanguage.getState().setLanguage(e.target.value as 'en' | 'de')}
              sx={{ mb: 2 }}
            >
              <MenuItem value="en">English</MenuItem>
              <MenuItem value="de">Deutsch</MenuItem>
            </TextField>
            <Box sx={{ textAlign: 'center', mb: 3 }}>
              <Box
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: '6px',
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 2,
                }}
              >
                <Lock sx={{ color: 'primary.contrastText', fontSize: 28 }} />
              </Box>
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 700,
                }}
              >
                {t('Performance Dashboard')}{' '}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: 'text.secondary',
                  mt: 0.5,
                }}
              >
                {t('Sign in to continue')}{' '}
              </Typography>
            </Box>

            {error && (
              <Alert severity="error" onClose={clearError} sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            {sso?.error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {sso.error}
              </Alert>
            )}
            {sso?.enabled && (
              <>
                <Button
                  component="a"
                  href={`${API_BASE_URL}/auth/oidc/start`}
                  variant="contained"
                  fullWidth
                  size="large"
                  sx={{ py: 1.5, fontWeight: 600 }}
                >
                  {t('Sign in with', 'Anmelden mit')} {sso.displayName}
                </Button>
                <Typography
                  variant="body2"
                  sx={{
                    color: 'text.secondary',
                    mt: 2,
                    mb: 1,
                    textAlign: 'center',
                  }}
                >
                  {t(
                    'Local sign-in is for recovery accounts only.',
                    'Die lokale Anmeldung ist nur für Notfallkonten.',
                  )}
                </Typography>
              </>
            )}
            <Box component="form" onSubmit={handleSubmit} noValidate>
              <TextField
                label={t('Username')}
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
                label={t('Password')}
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
                          aria-label={
                            showPassword
                              ? t('Hide password', 'Passwort verbergen')
                              : t('Show password', 'Passwort anzeigen')
                          }
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
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  '&:hover': {
                    bgcolor: 'primary.dark',
                  },
                }}
              >
                {isLoading ? <CircularProgress size={24} color="inherit" /> : t('Sign In')}
              </Button>
            </Box>
          </CardContent>
        </Card>
      </motion.div>
    </Box>
  );
}
