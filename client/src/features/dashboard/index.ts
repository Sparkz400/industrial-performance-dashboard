import DashboardTabs from './components/DashboardTabs';
import AddWidgetButton from './components/addWidgetButton';
import DashboardToolbar from './components/DashboardToolbar';
import WidgetManagementPanel from './components/WidgetManagementPanel';
import DashboardPage from './pages/dashboardPage';

// Export individual components
export { DashboardTabs, AddWidgetButton, DashboardToolbar, WidgetManagementPanel, DashboardPage };

// Export hooks
export { useDashboardState, ActionTypes } from './hooks/useDashboardState';
export { useDashboardOperations } from './hooks/useDashboardOperations';

// Export types
export type { DashboardState, DashboardAction, ServerSyncStatus } from './hooks/useDashboardState';

// Export default component for easier imports
export default DashboardPage;
