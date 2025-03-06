import React, { memo } from 'react';
import PropTypes from 'prop-types';
import {
    Box,
    Typography,
    FormControlLabel,
    Switch,
    Slider,
    Divider
} from '@mui/material';

/**
 * Settings component for the SystemStatusWidget
 */
const SystemStatusSettings = memo(({ config = {}, onConfigChange }) => {
    // Get the current settings, defaulting to sensible values if not provided
    const autoRefresh = config.autoRefresh !== undefined ? config.autoRefresh : true;
    const showDetails = config.showDetails !== undefined ? config.showDetails : true;
    const refreshInterval = config.refreshInterval || 20000;

    // Event handlers for configuration changes
    const handleAutoRefreshChange = (event) => {
        onConfigChange({ ...config, autoRefresh: event.target.checked });
    };

    const handleShowDetailsChange = (event) => {
        onConfigChange({ ...config, showDetails: event.target.checked });
    };

    const handleRefreshIntervalChange = (_, newValue) => {
        onConfigChange({ ...config, refreshInterval: newValue });
    };

    return (
        <Box sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Display Settings</Typography>

            <Box sx={{ mb: 3 }}>
                <FormControlLabel
                    control={
                        <Switch
                            checked={autoRefresh}
                            onChange={handleAutoRefreshChange}
                            color="primary"
                        />
                    }
                    label="Auto-refresh status"
                />
                <Typography variant="caption" color="textSecondary" display="block">
                    When enabled, status will automatically refresh based on the interval setting
                </Typography>
            </Box>

            {autoRefresh && (
                <Box sx={{ mb: 3 }}>
                    <Typography id="refresh-interval-slider" gutterBottom>
                        Refresh Interval: {refreshInterval / 1000} seconds
                    </Typography>
                    <Slider
                        value={refreshInterval}
                        onChange={handleRefreshIntervalChange}
                        aria-labelledby="refresh-interval-slider"
                        min={5000}
                        max={60000}
                        step={5000}
                        marks={[
                            { value: 5000, label: '5s' },
                            { value: 30000, label: '30s' },
                            { value: 60000, label: '60s' }
                        ]}
                        valueLabelDisplay="auto"
                        valueLabelFormat={(value) => `${value / 1000}s`}
                    />
                </Box>
            )}

            <Divider sx={{ my: 2 }} />

            <Box>
                <FormControlLabel
                    control={
                        <Switch
                            checked={showDetails}
                            onChange={handleShowDetailsChange}
                            color="primary"
                        />
                    }
                    label="Show detailed information"
                />
                <Typography variant="caption" color="textSecondary" display="block">
                    Display additional system status details
                </Typography>
            </Box>
        </Box>
    );
});

SystemStatusSettings.propTypes = {
    /** Current widget configuration */
    config: PropTypes.shape({
        autoRefresh: PropTypes.bool,
        showDetails: PropTypes.bool,
        refreshInterval: PropTypes.number
    }),
    /** Callback function for configuration changes */
    onConfigChange: PropTypes.func.isRequired
};

SystemStatusSettings.displayName = 'SystemStatusSettings';

export default SystemStatusSettings;