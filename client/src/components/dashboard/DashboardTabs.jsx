import React from 'react';
import PropTypes from 'prop-types';
import { Tabs, Tab, Box, TextField, CircularProgress, Typography } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';

// Isolated loading indicator to prevent prop leakage
const LoadingIndicator = () => (
    <CircularProgress
        size={16}
        sx={{ ml: 2, color: 'primary.main' }}
    />
);

// Tab label component
const DashboardTabLabel = ({
                               dashboard,
                               isEditing,
                               isSelected,
                               onEditName,
                               onDelete
                           }) => {
    // Add local state to track the input value while editing
    const [editValue, setEditValue] = React.useState(dashboard.name);

    // Reset edit value when dashboard or isEditing changes
    React.useEffect(() => {
        if (isEditing) {
            setEditValue(dashboard.name);
        }
    }, [dashboard.name, isEditing]);

    // Handle saving the edit
    const handleSaveEdit = () => {
        // Only save if the value actually changed and isn't empty
        if (editValue && editValue.trim() !== '' && editValue !== dashboard.name) {
            onEditName(dashboard.id, editValue);
        } else {
            // Just exit edit mode if value is empty or unchanged
            onEditName(dashboard.id, null);
        }
    };

    // Handle cancel edit (e.g., when Escape is pressed)
    const handleCancelEdit = () => {
        // Reset to original value and exit edit mode
        setEditValue(dashboard.name);
        onEditName(dashboard.id, null);
    };

    if (isEditing) {
        return (
            <TextField
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                // Save on blur (clicking away)
                onBlur={handleSaveEdit}
                // Handle keyboard events
                onKeyDown={(e) => {
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
                '&:hover .edit-icon': { opacity: 1 }
            }}
        >
            <Typography
                component="span"
                sx={{
                    color: isSelected ? 'primary.main' : 'inherit',
                    fontWeight: isSelected ? 'bold' : 'normal'
                }}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    console.log('Double click on dashboard name');
                    onEditName(dashboard.id);
                }}
            >
                {dashboard.name}
            </Typography>

            {/* Edit icon */}
            <span
                onClick={(e) => {
                    e.stopPropagation();
                    console.log('Edit icon clicked');
                    onEditName(dashboard.id);
                }}
                style={{
                    display: 'inline-flex',
                    marginLeft: '8px',
                    opacity: 0,
                    transition: 'opacity 0.2s ease',
                    cursor: 'pointer'
                }}
                className="edit-icon"
            >
                <EditIcon fontSize="small" />
            </span>

            {/* Delete icon */}
            <span
                onClick={(e) => {
                    e.stopPropagation();
                    onDelete(dashboard.id);
                }}
                style={{
                    display: 'inline-flex',
                    marginLeft: '8px',
                    cursor: 'pointer'
                }}
            >
                <CloseIcon fontSize="small" />
            </span>
        </Box>
    );
};

// Main dashboard tabs component - completely rewritten to avoid prop inheritance issues
const DashboardTabs = ({
                           dashboards,
                           selectedIndex,
                           onSelectDashboard,
                           onEditName,
                           onDeleteDashboard,
                           editingDashboardId,
                           loading
                       }) => {
    // Create tab elements
    const tabElements = dashboards.map((dashboard, index) => (
        <Tab
            key={dashboard.id}
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
                aria-label="dashboard tabs"
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

DashboardTabs.propTypes = {
    dashboards: PropTypes.arrayOf(
        PropTypes.shape({
            id: PropTypes.string.isRequired,
            name: PropTypes.string.isRequired
        })
    ).isRequired,
    selectedIndex: PropTypes.number.isRequired,
    onSelectDashboard: PropTypes.func.isRequired,
    onEditName: PropTypes.func.isRequired,
    onDeleteDashboard: PropTypes.func.isRequired,
    editingDashboardId: PropTypes.string,
    loading: PropTypes.bool
};

DashboardTabs.defaultProps = {
    editingDashboardId: null,
    loading: false
};

export default React.memo(DashboardTabs);