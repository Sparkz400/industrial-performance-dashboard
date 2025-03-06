import ErrorBoundary from './components/ErrorBoundary';
import { StatusProvider, useSystemStatus } from './contexts/StatusContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';

// Export individual components and hooks
export {
    ErrorBoundary,
    StatusProvider,
    useSystemStatus,
    ThemeProvider,
    useTheme
};

// Export a convenient way to use all providers together
export const SystemProviders = ({ children }) => (
    <ThemeProvider>
        <StatusProvider>
            {children}
        </StatusProvider>
    </ThemeProvider>
);

// Export default component for easier imports
export default SystemProviders;