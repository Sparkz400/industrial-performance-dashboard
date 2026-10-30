import { createTheme, alpha } from '@mui/material/styles';

export const createModernTheme = (mode: 'dark' | 'light') => {
  const isDark = mode === 'dark';
  const chassis = isDark ? '#242C31' : '#D7DCDE';
  const raised = isDark ? '#323C42' : '#E9EDEE';
  const field = isDark ? '#141B1F' : '#F8FAFB';
  const well = isDark ? '#192126' : '#C7CED1';
  const edge = isDark ? '#46545C' : '#B1BCC1';
  const controlEdge = isDark ? '#809098' : '#78878F';
  const shine = isDark ? '#546169' : '#FFFFFF';
  const ink = isDark ? '#EDF1F2' : '#20282D';
  const label = isDark ? '#B0BEC5' : '#505E66';
  const accent = isDark ? '#FF9B70' : '#B83D0C';
  const raisedShadow = `inset 0 1px ${shine}, 0 2px 3px ${alpha('#000', 0.12)}`;

  return createTheme({
    palette: {
      mode,
      primary: {
        main: accent,
        light: isDark ? '#FFBB9D' : '#D64D16',
        dark: isDark ? '#F17842' : '#922E08',
        contrastText: isDark ? '#20282D' : '#FFFFFF',
      },
      secondary: {
        main: isDark ? '#B0BEC5' : '#505E66',
        light: isDark ? '#D8E0E4' : '#6B7B84',
        dark: isDark ? '#8C9FA9' : '#34434B',
        contrastText: isDark ? '#20282D' : '#FFFFFF',
      },
      error: { main: isDark ? '#FF958D' : '#B42318' },
      warning: { main: isDark ? '#F4C56B' : '#865300' },
      info: { main: isDark ? '#80C5E0' : '#176080' },
      success: { main: isDark ? '#A1D7B8' : '#256248' },
      background: { default: chassis, paper: raised },
      text: { primary: ink, secondary: label },
      divider: edge,
      action: { active: label, selected: alpha(accent, 0.12), hover: alpha(accent, 0.06) },
    },
    shape: { borderRadius: 6 },
    typography: {
      fontFamily: 'var(--font-family)',
      fontWeightRegular: 400,
      fontWeightMedium: 500,
      fontWeightBold: 700,
      h1: { fontWeight: 700 },
      h2: { fontWeight: 700 },
      h3: { fontWeight: 600 },
      h4: { fontSize: '1.625rem', lineHeight: 1.25, fontWeight: 600, letterSpacing: '-0.02em' },
      h5: { fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.01em' },
      h6: { fontWeight: 600, letterSpacing: '-0.01em', fontSize: '1.05rem' },
      subtitle1: { fontWeight: 600, fontSize: '0.95rem' },
      button: { fontWeight: 600 },
      body2: { fontSize: '0.85rem', lineHeight: 1.6 },
      caption: { fontSize: '0.75rem', letterSpacing: '0.02em' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ':root': { colorScheme: mode, backgroundColor: chassis },
          body: {
            '--industrial-field': field,
            '--industrial-well': well,
            '--industrial-raised': raised,
            '--industrial-edge': edge,
            '--industrial-shine': shine,
            '--industrial-accent': accent,
            '--industrial-on-accent': isDark ? '#20282D' : '#FFFFFF',
            '--industrial-ink': ink,
            '--industrial-label': label,
            scrollbarWidth: 'thin',
            scrollbarColor: `${controlEdge} ${chassis}`,
          },
          a: { color: 'inherit', textUnderlineOffset: '0.18em' },
          '::selection': { background: alpha(accent, 0.25) },
          'input, textarea': { caretColor: accent },
          'td, time': { fontVariantNumeric: 'tabular-nums' },
          '@media (pointer: coarse), (max-width:1099px)': {
            '.MuiButton-root, .MuiIconButton-root, .MuiTab-root, .MuiMenuItem-root': {
              minHeight: 44,
            },
            '.MuiIconButton-root': { minWidth: 44 },
          },
          ':focus-visible': { outline: `3px solid ${accent}`, outlineOffset: 3 },
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': {
              animationDuration: '0.01ms !important',
              animationIterationCount: '1 !important',
              transitionDuration: '0.01ms !important',
              scrollBehavior: 'auto !important',
            },
          },
        },
      },
      // Every progress indicator needs an accessible name; specific labels override this.
      MuiCircularProgress: { defaultProps: { 'aria-label': 'Loading' } },
      MuiLinearProgress: { defaultProps: { 'aria-label': 'Loading' } },
      MuiFormLabel: { styleOverrides: { root: { fontWeight: 500 } } },
      MuiFormControlLabel: { styleOverrides: { label: { fontWeight: 500 } } },
      MuiButton: {
        styleOverrides: {
          root: { textTransform: 'none', fontWeight: 600, borderRadius: 5, padding: '8px 16px' },
          contained: {
            boxShadow: raisedShadow,
            '&:hover': { boxShadow: raisedShadow },
            '&:active': { boxShadow: `inset 0 2px 3px ${alpha('#000', 0.2)}` },
          },
          outlined: { borderColor: controlEdge },
        },
      },
      MuiIconButton: { styleOverrides: { root: { borderRadius: 5 } } },
      MuiFab: { styleOverrides: { root: { borderRadius: 6, boxShadow: raisedShadow } } },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none', border: `1px solid ${edge}` },
          elevation1: { boxShadow: raisedShadow },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: { borderRadius: 7, backgroundColor: raised, boxShadow: raisedShadow },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: chassis,
            borderRight: `1px solid ${edge}`,
            boxShadow: `1px 0 ${shine}`,
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 5,
            '&.Mui-selected': {
              backgroundColor: raised,
              boxShadow: `inset 1px 0 ${accent}`,
              '&:hover': { backgroundColor: raised },
            },
          },
        },
      },
      MuiChip: { styleOverrides: { root: { fontWeight: 500, borderRadius: 4 } } },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            borderRadius: 4,
            fontSize: '0.8rem',
            backgroundColor: '#20282D',
            color: '#EDF1F2',
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 7,
            backgroundColor: raised,
            '@media (max-width:599px)': {
              margin: 8,
              maxWidth: 'calc(100% - 16px)',
              width: 'calc(100% - 16px)',
            },
          },
        },
      },
      MuiDialogActions: { styleOverrides: { root: { flexWrap: 'wrap', gap: 8, padding: 16 } } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: { borderRadius: 5, backgroundColor: field },
          notchedOutline: { borderColor: controlEdge },
        },
      },
      MuiSelect: {
        styleOverrides: {
          select: {
            '@media (pointer: coarse), (max-width:1099px)': {
              minHeight: 44,
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
            },
          },
        },
      },
      MuiAutocomplete: {
        styleOverrides: {
          input: {
            '@media (pointer: coarse), (max-width:1099px)': {
              minHeight: 44,
              boxSizing: 'border-box',
            },
          },
        },
      },
      MuiTablePagination: {
        styleOverrides: {
          toolbar: { flexWrap: 'wrap', justifyContent: 'flex-end', padding: 8 },
          spacer: { display: 'none' },
          selectLabel: { margin: 0 },
          displayedRows: { margin: 0 },
          actions: { marginLeft: 8 },
        },
      },
      MuiTableContainer: { styleOverrides: { root: { backgroundColor: field } } },
      MuiTableCell: {
        styleOverrides: {
          head: { backgroundColor: well, color: ink, fontWeight: 600 },
          root: { borderBottomColor: edge },
        },
      },
      MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
      MuiAlert: {
        styleOverrides: { root: { borderRadius: 5, borderLeft: '1px solid currentColor' } },
      },
      MuiAccordion: {
        styleOverrides: { root: { backgroundColor: raised, backgroundImage: 'none' } },
      },
    },
  });
};
