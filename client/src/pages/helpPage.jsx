import React from 'react';
import { Typography, Box } from '@mui/material';

const HelpPage = () => {
    return (
        <Box>
            <Typography variant="h4" gutterBottom>
                Help & Documentation
            </Typography>
            <Typography variant="body1">
                Here you can find help, FAQs, and documentation for the dashboard.
            </Typography>
            {/* Add links, instructions, or any support resources */}
        </Box>
    );
};

export default HelpPage;
