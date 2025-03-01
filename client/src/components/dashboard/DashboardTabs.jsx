import React from 'react';
import PropTypes from 'prop-types';
import { Tabs, Tab, Box, TextField, CircularProgress, Typography } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';

// Tab label component
const DashboardTabLabel = ({
                               dashboard,
                               isEditing,
                               isSelected,
                               onEditName,
                               onDelete
                           }) => {
    if (isEditing) {
        return (
            <TextField
                value={dashboard.name}
                onChange={(e) => onEditName(dashboard.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
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
            >
                {dashboard.name}
            </Typography>

            {/* Edit icon */}
            <span
                onClick={(e) => {
                    e.stopPropagation();
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

// Main dashboard tabs component
const DashboardTabs = ({
                           dashboards,
                           selectedIndex,
                           onSelectDashboard,
                           onEditName,
                           onDeleteDashboard,
                           editingDashboardId,
                           loading
                       }) => {
    return (
        <Tabs
            value={selectedIndex !== -1 ? selectedIndex : 0}
            onChange={onSelectDashboard}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ flexGrow: 1 }}
        >
            {dashboards.map((dashboard, index) => (
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
            ))}

            {/* Loading indicator */}
            {loading && (
                <CircularProgress
                    size={16}
                    sx={{ ml: 2, color: 'primary.main' }}
                />
            )}
        </Tabs>
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