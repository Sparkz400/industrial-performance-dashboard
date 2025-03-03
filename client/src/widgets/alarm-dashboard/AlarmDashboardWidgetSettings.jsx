import React from 'react';
import PropTypes from 'prop-types';
import {
    Box,
    Typography,
    FormControlLabel,
    Switch,
    Slider
} from '@mui/material';

// Minimal settings component
function AlarmDashboardWidgetSettings({ config, onConfigChange }) {
    const { rowsPerPage = 5 } = config || {};

    const handleRowsChange = (event, newValue) => {
        onConfigChange({
            ...config,
            rowsPerPage: newValue
        });
    };

    return (
        <Box sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
                Alarm Dashboard Settings
            </Typography>

            <Box sx={{ mt: 2 }}>
                <Typography gutterBottom>
                    Rows per page: {rowsPerPage}
                </Typography>
                <Slider
                    value={rowsPerPage}
                    step={5}
                    marks
                    min={5}
                    max={25}
                    onChange={handleRowsChange}
                />
            </Box>
        </Box>
    );
}

AlarmDashboardWidgetSettings.propTypes = {
    config: PropTypes.object,
    onConfigChange: PropTypes.func.isRequired
};

export default AlarmDashboardWidgetSettings;