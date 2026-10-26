import { createTheme, alpha } from '@mui/material/styles';

export const createModernTheme = (mode: 'dark' | 'light') => {
  const isDark = mode === 'dark';

  return createTheme({
    palette: {
      mode,
      primary: {
        main: isDark ? '#6C63FF' : '#5B54E6',
        light: isDark ? '#9D97FF' : '#7E78FF',
        dark: isDark ? '#4A42D4' : '#3D36B3',
      },
      secondary: {
        main: isDark ? '#FF6B9D' : '#E91E63',
        light: isDark ? '#FF9DC1' : '#F06292',
        dark: isDark ? '#D44A7A' : '#C2185B',
      },
      error: { main: '#F44336' },
      warning: { main: '#FF9800' },
      info: { main: '#29B6F6' },
      success: { main: '#66BB6A' },
      background: {
        default: isDark ? '#0F1117' : '#F0F2F5',
        paper: isDark ? '#1A1D27' : '#FFFFFF',
      },
      text: {
        primary: isDark ? '#E8E8ED' : '#1A1A2E',
        secondary: isDark ? '#9DA3B4' : '#6B7280',
      },
      divider: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
    },
    shape: {
      borderRadius: 12,
    },
    typography: {
      fontFamily: 'var(--font-family)',
      fontWeightRegular: 400,
      fontWeightMedium: 500,
      fontWeightBold: 700,
      h1: { fontWeight: 700 },
      h2: { fontWeight: 700 },
      h3: { fontWeight: 600 },
      h4: { fontWeight: 700, letterSpacing: '-0.02em' },
      h5: { fontWeight: 700, letterSpacing: '-0.01em' },
      h6: { fontWeight: 600, letterSpacing: '-0.01em', fontSize: '1.05rem' },
      subtitle1: { fontWeight: 600, fontSize: '0.95rem' },
      button: { fontWeight: 600 },
      body2: { fontSize: '0.85rem', lineHeight: 1.6 },
      caption: { fontSize: '0.75rem', letterSpacing: '0.02em' },
    },
    components: {
      MuiFormLabel: {
        styleOverrides: { root: { fontWeight: 500 } },
      },
      MuiFormControlLabel: {
        styleOverrides: { label: { fontWeight: 500 } },
      },
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            transition: 'background-color 0.3s ease, color 0.3s ease',
            scrollbarWidth: 'thin',
            scrollbarColor: isDark ? '#3A3D4A #1A1D27' : '#C0C0C0 #F0F2F5',
            '&::-webkit-scrollbar': { width: '6px' },
            '&::-webkit-scrollbar-track': { background: isDark ? '#1A1D27' : '#F0F2F5' },
            '&::-webkit-scrollbar-thumb': {
              background: isDark ? '#3A3D4A' : '#C0C0C0',
              borderRadius: '3px',
            },
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 10,
            padding: '8px 20px',
          },
          contained: {
            boxShadow: 'none',
            '&:hover': {
              boxShadow: `0 4px 12px ${alpha(isDark ? '#6C63FF' : '#5B54E6', 0.4)}`,
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            transition:
              'background 0.3s ease, background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease',
            // Glassmorphism base
            ...(isDark
              ? {
                  background: `linear-gradient(135deg, ${alpha('#1A1D27', 0.8)}, ${alpha('#252836', 0.6)})`,
                  backdropFilter: 'blur(20px)',
                  border: `1px solid ${alpha('#fff', 0.06)}`,
                }
              : {
                  background: `linear-gradient(135deg, ${alpha('#FFFFFF', 0.9)}, ${alpha('#F8F9FB', 0.7)})`,
                  backdropFilter: 'blur(20px)',
                  border: `1px solid ${alpha('#000', 0.05)}`,
                }),
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            transition:
              'all 0.3s cubic-bezier(0.4, 0, 0.2, 1), background 0.3s ease, border-color 0.3s ease',
            ...(isDark
              ? {
                  background: `linear-gradient(145deg, ${alpha('#1E2130', 0.9)}, ${alpha('#262940', 0.7)})`,
                  backdropFilter: 'blur(24px)',
                  border: `1px solid ${alpha('#fff', 0.08)}`,
                  boxShadow: `0 4px 20px ${alpha('#000', 0.3)}`,
                  '&:hover': {
                    boxShadow: `0 8px 32px ${alpha('#6C63FF', 0.15)}`,
                    border: `1px solid ${alpha('#6C63FF', 0.2)}`,
                  },
                }
              : {
                  background: `linear-gradient(145deg, ${alpha('#fff', 0.95)}, ${alpha('#F8F9FB', 0.8)})`,
                  backdropFilter: 'blur(24px)',
                  border: `1px solid ${alpha('#000', 0.06)}`,
                  boxShadow: `0 4px 20px ${alpha('#000', 0.06)}`,
                  '&:hover': {
                    boxShadow: `0 8px 32px ${alpha('#5B54E6', 0.1)}`,
                    border: `1px solid ${alpha('#5B54E6', 0.15)}`,
                  },
                }),
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            borderRight: 'none',
            transition: 'background 0.3s ease, box-shadow 0.3s ease',
            ...(isDark
              ? {
                  background: `linear-gradient(180deg, ${alpha('#141620', 0.95)}, ${alpha('#1A1D27', 0.9)})`,
                  backdropFilter: 'blur(24px)',
                  boxShadow: `4px 0 24px ${alpha('#000', 0.4)}`,
                }
              : {
                  background: `linear-gradient(180deg, ${alpha('#FFFFFF', 0.95)}, ${alpha('#F8F9FB', 0.9)})`,
                  backdropFilter: 'blur(24px)',
                  boxShadow: `4px 0 24px ${alpha('#000', 0.05)}`,
                }),
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 500,
            borderRadius: 8,
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            borderRadius: 8,
            fontSize: '0.8rem',
            ...(isDark
              ? {
                  background: alpha('#2A2D3A', 0.95),
                  backdropFilter: 'blur(8px)',
                }
              : {
                  background: alpha('#1A1A2E', 0.9),
                  backdropFilter: 'blur(8px)',
                }),
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 20,
            ...(isDark
              ? {
                  background: `linear-gradient(145deg, ${alpha('#1E2130', 0.95)}, ${alpha('#262940', 0.9)})`,
                  backdropFilter: 'blur(24px)',
                  border: `1px solid ${alpha('#fff', 0.08)}`,
                }
              : {}),
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: 10,
            },
          },
        },
      },
    },
  });
};
