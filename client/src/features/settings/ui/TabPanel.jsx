import React from 'react';
import { Box } from '@mui/material';

function TabPanel(props) {
    const { children, value, index, sx, ...other } = props;

    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`settings-tabpanel-${index}`}
            aria-labelledby={`settings-tab-${index}`}
            style={{ width: '100%', padding: '16px' }}
            {...other}
        >
            {value === index && (
                <Box sx={{ ...sx }}>
                    {children}
                </Box>
            )}
        </div>
    );
}

export default TabPanel;