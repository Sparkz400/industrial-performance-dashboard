import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { createTheme, ThemeProvider as MuiThemeProvider } from '@mui/material';
import { alpha } from '@mui/material/styles';

// Create the context
export const ThemeContext = createContext({
    themeMode: 'dark',
    useSystemTheme: false,
    toggleTheme: () => {},
    setThemeMode: () => {},
    setUseSystemTheme: () => {}
});

// Custom hook to use the theme context
export const useTheme = () => useContext(ThemeContext);

// Provider component
export const ThemeProvider = ({ children }) => {
    // Get preferred color scheme media query
    const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)');

    // Initialize states based on localStorage or defaults
    const [themeMode, setThemeModeState] = useState(() => {
        // Check if theme is stored in localStorage
        const storedMode = localStorage.getItem('themeMode');
        if (storedMode) return storedMode;

        // Check if useSystemTheme is enabled
        const useSystemPref = localStorage.getItem('useSystemTheme') === 'true';
        if (useSystemPref) {
            return prefersDarkMode.matches ? 'dark' : 'light';
        }

        // Default to dark mode
        return 'dark';
    });

    const [useSystemTheme, setUseSystemThemeState] = useState(() => {
        return localStorage.getItem('useSystemTheme') === 'true';
    });

    // Update theme mode based on system preference when useSystemTheme is enabled
    useEffect(() => {
        // If not using system theme, we don't need to do anything
        if (!useSystemTheme) return;

        // Create the event handler and reference it consistently
        const handlePreferenceChange = (e) => {
            setThemeModeState(e.matches ? 'dark' : 'light');
        };

        // Store the media query in a local variable to ensure
        // we're adding and removing listeners on the same object
        const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');

        // Set initial value based on current preference
        handlePreferenceChange(darkModeQuery);

        // Check if the browser supports addEventListener on MediaQueryList
        // (older browsers use a different API)
        if (darkModeQuery.addEventListener) {
            darkModeQuery.addEventListener('change', handlePreferenceChange);

            // Return cleanup function that uses the same handler reference
            return () => {
                darkModeQuery.removeEventListener('change', handlePreferenceChange);
            };
        } else if (darkModeQuery.addListener) {
            // Legacy method for older browsers
            darkModeQuery.addListener(handlePreferenceChange);

            return () => {
                darkModeQuery.removeListener(handlePreferenceChange);
            };
        }

        // No cleanup needed if browser doesn't support either method
        return undefined;
    }, [useSystemTheme]);

    // Persist theme mode to localStorage
    const setThemeMode = (mode) => {
        setThemeModeState(mode);
        localStorage.setItem('themeMode', mode);

        // Disable system theme when manually setting a theme
        if (useSystemTheme) {
            setUseSystemTheme(false);
        }
    };

    // Toggle between light and dark mode
    const toggleTheme = () => {
        const newMode = themeMode === 'dark' ? 'light' : 'dark';
        setThemeMode(newMode);
    };

    // Update system theme preference
    const setUseSystemTheme = (value) => {
        setUseSystemThemeState(value);
        localStorage.setItem('useSystemTheme', value.toString());

        // Update theme based on system preference if enabled
        if (value) {
            setThemeModeState(prefersDarkMode.matches ? 'dark' : 'light');
        }
    };

    // Create MUI theme
    const theme = useMemo(() => {
        // Common palette for both light and dark
        const commonPalette = {
            primary: {
                main: themeMode === 'dark' ? '#53b4f3' : '#1976d2',
            },
            secondary: {
                main: themeMode === 'dark' ? '#f45f7c' : '#dc004e',
            },
            error: {
                main: '#f44336',
            },
            warning: {
                main: '#ff9800',
            },
            info: {
                main: '#2196f3',
            },
            success: {
                main: '#4caf50',
            },
        };

        // Specific overrides for dark/light mode
        return createTheme({
            palette: {
                mode: themeMode,
                ...commonPalette,
                ...(themeMode === 'dark'
                    ? {
                        background: {
                            default: '#1e1f22',
                            paper: '#2b2d30',
                        },
                    }
                    : {
                        background: {
                            default: '#f5f5f5',
                            paper: '#ffffff',
                        },
                    }),
            },
            components: {
                MuiButton: {
                    styleOverrides: {
                        root: {
                            textTransform: 'none',
                        },
                    },
                },
                MuiDrawer: {
                    styleOverrides: {
                        paper: {
                            backgroundColor: themeMode === 'dark' ? '#2b2d30' : '#f5f5f5',
                            boxShadow: themeMode === 'dark'
                                ? '0px 3px 5px rgba(0,0,0,0.3)'
                                : '0px 3px 5px rgba(0,0,0,0.1)',
                        },
                    },
                },
                MuiCard: {
                    styleOverrides: {
                        root: {
                            backgroundColor: themeMode === 'dark' ? alpha('#2b2d30', 0.8) : '#ffffff',
                            transition: 'box-shadow 0.3s ease',
                            '&:hover': {
                                boxShadow: themeMode === 'dark'
                                    ? '0px 5px 15px rgba(0,0,0,0.3)'
                                    : '0px 5px 15px rgba(0,0,0,0.1)',
                            },
                        },
                    },
                },
            },
        });
    }, [themeMode]);

    // Provide context values
    const contextValue = {
        themeMode,
        useSystemTheme,
        toggleTheme,
        setThemeMode,
        setUseSystemTheme
    };

    return (
        <ThemeContext.Provider value={contextValue}>
            <MuiThemeProvider theme={theme}>
                {children}
            </MuiThemeProvider>
        </ThemeContext.Provider>
    );
};

export default ThemeProvider;