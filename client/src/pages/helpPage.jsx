import React from 'react';
import { Typography, Box, Paper, Button } from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import Grid from '@mui/material/Grid2';

const HelpPage = () => {
    return (
        <Box
            sx={{
                background: 'linear-gradient(135deg, #595959FF, #B3B3FF)',
                minHeight: '100vh',
                p: 4,
            }}
        >
            <Paper sx={{ p: 4, borderRadius: 2, boxShadow: 3 }}>
                <Grid container spacing={2} alignItems="center">
                    <Grid>
                        <HelpOutlineIcon sx={{ fontSize: 50, color: '#b3b3b3' }} />
                    </Grid>
                    <Grid xs>
                        <Typography variant="h4" gutterBottom>
                            Help & Documentation
                        </Typography>
                        <Typography variant="body1" color="textSecondary">
                            Find help, FAQs, and documentation for the dashboard below.
                        </Typography>
                    </Grid>
                </Grid>

                <Box mt={4}>
                    <Typography variant="h6" gutterBottom>
                        Getting Started
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        Learn how to navigate through the dashboard and use its features effectively.
                    </Typography>
                    <Button variant="contained" color="primary" sx={{ mr: 2 }}>
                        Quick Start Guide
                    </Button>
                    <Button variant="outlined" color="primary">
                        Watch Tutorial
                    </Button>
                </Box>

                <Box mt={4}>
                    <Typography variant="h6" gutterBottom>
                        FAQs
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        Check out the most frequently asked questions to resolve common issues.
                    </Typography>
                    <Button variant="outlined" color="secondary">
                        View FAQs
                    </Button>
                </Box>

                <Box mt={4}>
                    <Typography variant="h6" gutterBottom>
                        Support
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        Need more help? Contact our support team for assistance.
                    </Typography>
                    <Button variant="contained" color="secondary">
                        Contact Support
                    </Button>
                </Box>
            </Paper>
        </Box>
    );
};

export default HelpPage;
