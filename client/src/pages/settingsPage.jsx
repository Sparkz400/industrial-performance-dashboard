import React from 'react';
import { Typography, Box } from '@mui/material';

const SettingsPage = () => {
    return (
        <Box>
            <Typography variant="h4" gutterBottom>
                Settings
            </Typography>
            <Typography variant="body1">
                Configure your dashboard preferences here...
            </Typography>
            {/* Add forms, toggles, or other configuration UI */}
        </Box>
    );
};

export default SettingsPage;
