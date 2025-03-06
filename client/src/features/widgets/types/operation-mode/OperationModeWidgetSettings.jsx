import React from 'react';
import PropTypes from 'prop-types';
import {
    Box,
    Typography,
    Slider,
    FormControlLabel,
    Switch
} from '@mui/material';

/**
 * Settings component for Operation Mode Widget
 */
const OperationModeWidgetSettings = ({ config, onConfigChange }) => {
    // Ensure we have default values if config is undefined
    const {
        maxPoints = 120,
        showBrush = true
    } = config || {};

    const handleMaxPointsChange = (_, newValue) => {
        onConfigChange({ ...config, maxPoints: newValue });
    };

    const handleShowBrushChange = (event) => {
        onConfigChange({ ...config, showBrush: event.target.checked });
    };

    return (
        <Box sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
                Data Points
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
                Maximum number of data points to display: {maxPoints}
            </Typography>
            <Slider
                value={maxPoints}
                onChange={handleMaxPointsChange}
                min={20}
                max={1000}
                step={20}
                marks={[
                    { value: 20, label: '20' },
                    { value: 500, label: '500' },
                    { value: 1000, label: '1000' }
                ]}
                sx={{ mb: 3 }}
            />

            <FormControlLabel
                control={
                    <Switch
                        checked={showBrush}
                        onChange={handleShowBrushChange}
                    />
                }
                label="Show time range selector"
            />
        </Box>
    );
};

OperationModeWidgetSettings.propTypes = {
    config: PropTypes.shape({
        maxPoints: PropTypes.number,
        showBrush: PropTypes.bool
    }),
    onConfigChange: PropTypes.func.isRequired
};

OperationModeWidgetSettings.defaultProps = {
    config: {
        maxPoints: 120,
        showBrush: true
    }
};

export default OperationModeWidgetSettings;