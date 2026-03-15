import ErrorBoundary from './components/ErrorBoundary';

// Re-export Zustand stores for convenience
export { useStatusStore } from '../../stores/useStatusStore.ts';
export { useThemeStore } from '../../stores/useThemeStore.ts';

export { ErrorBoundary };

export default ErrorBoundary;
