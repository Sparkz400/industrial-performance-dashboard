import { useT } from '@/i18n';
import React from 'react';
import { Tabs, Tab, Box, TextField, CircularProgress, Typography } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';

import type { Dashboard } from '@/types';

// Isolated loading indicator to prevent prop leakage
const LoadingIndicator: React.FC = () => (
  <CircularProgress size={16} sx={{ ml: 2, color: 'primary.main' }} />
);

// Tab label props
interface DashboardTabLabelProps {
  dashboard: Dashboard;
  isEditing: boolean;
  isSelected: boolean;
  onEditName: (dashboardId: string, newName?: string | null) => void;
  onDelete: (dashboardId: string) => void;
}

// Tab label component
const DashboardTabLabel: React.FC<DashboardTabLabelProps> = ({
  dashboard,
  isEditing,
  isSelected,
  onEditName,
  onDelete,
}) => {
  // Add local state to track the input value while editing
  const [editValue, setEditValue] = React.useState<string>(dashboard.name);

  // Reset edit value when dashboard or isEditing changes
  React.useEffect(() => {
    if (isEditing) {
      setEditValue(dashboard.name);
    }
  }, [dashboard.name, isEditing]);

  // Handle saving the edit
  const handleSaveEdit = (): void => {
    // Validate input: make sure it's not empty/whitespace-only
    const trimmedValue = editValue.trim();

    if (trimmedValue === '') {
      // Just exit edit mode without saving if value is empty
      handleCancelEdit();
      return;
    }

    // Only save if the value actually changed
    if (trimmedValue !== dashboard.name) {
      onEditName(dashboard.id, trimmedValue);
    } else {
      // Just exit edit mode if value is unchanged
      onEditName(dashboard.id, null);
    }
  };

  // Handle cancel edit (e.g., when Escape is pressed)
  const handleCancelEdit = (): void => {
    // Reset to original value and exit edit mode
    setEditValue(dashboard.name);
    onEditName(dashboard.id, null);
  };

  if (isEditing) {
    return (
      <TextField
        value={editValue}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditValue(e.target.value)}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        // Save on blur (clicking away)
        onBlur={handleSaveEdit}
        // Handle keyboard events
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') {
            // Save on Enter
            handleSaveEdit();
          } else if (e.key === 'Escape') {
            // Cancel on Escape
            handleCancelEdit();
          }
        }}
        autoFocus
        variant="standard"
        size="small"
        sx={{ minWidth: '100px' }}
      />
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        '&:hover .edit-icon': { opacity: 1 },
      }}
    >
      <Typography
        component="span"
        sx={{
          color: isSelected ? 'primary.main' : 'inherit',
          fontWeight: isSelected ? 'bold' : 'normal',
        }}
        onDoubleClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          onEditName(dashboard.id);
        }}
      >
        {dashboard.name}
      </Typography>

      {/* Edit icon */}
      <span
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          onEditName(dashboard.id);
        }}
        style={{
          display: 'inline-flex',
          marginLeft: '8px',
          opacity: 0,
          transition: 'opacity 0.2s ease',
          cursor: 'pointer',
        }}
        className="edit-icon"
      >
        <EditIcon fontSize="small" />
      </span>

      {/* Delete icon */}
      <span
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          onDelete(dashboard.id);
        }}
        style={{
          display: 'inline-flex',
          marginLeft: '8px',
          cursor: 'pointer',
        }}
      >
        <CloseIcon fontSize="small" />
      </span>
    </Box>
  );
};

// Main dashboard tabs props
interface DashboardTabsProps {
  dashboards: Dashboard[];
  selectedIndex: number;
  onSelectDashboard: (event: React.SyntheticEvent, newIndex: number) => void;
  onEditName: (dashboardId: string, newName?: string | null) => void;
  onDeleteDashboard: (dashboardId: string) => void;
  editingDashboardId?: string | null;
  loading?: boolean;
}

// Main dashboard tabs component
const DashboardTabs: React.FC<DashboardTabsProps> = ({
  dashboards,
  selectedIndex,
  onSelectDashboard,
  onEditName,
  onDeleteDashboard,
  editingDashboardId = null,
  loading = false,
}) => {
  const t = useT();

  // Create tab elements
  const tabElements = dashboards.map((dashboard, index) => (
    <Tab
      key={dashboard.id}
      aria-keyshortcuts="Delete"
      onKeyDown={(event) => {
        if (
          event.key === 'Delete' &&
          event.target === event.currentTarget &&
          editingDashboardId !== dashboard.id
        ) {
          event.preventDefault();
          onDeleteDashboard(dashboard.id);
        }
      }}
      label={
        <DashboardTabLabel
          dashboard={dashboard}
          isEditing={editingDashboardId === dashboard.id}
          isSelected={selectedIndex === index}
          onEditName={onEditName}
          onDelete={onDeleteDashboard}
        />
      }
      disabled={loading}
    />
  ));

  return (
    <Box sx={{ width: '100%', flexGrow: 1 }}>
      <Tabs
        value={selectedIndex !== -1 ? selectedIndex : 0}
        onChange={onSelectDashboard}
        variant="scrollable"
        scrollButtons="auto"
        aria-label={t('dashboard tabs')}
      >
        {tabElements}
      </Tabs>
      {loading && (
        <Box sx={{ display: 'inline-flex', ml: 2 }}>
          <LoadingIndicator />
        </Box>
      )}
    </Box>
  );
};

export default React.memo(DashboardTabs);
