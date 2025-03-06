import React from 'react';
import { Alert, Collapse } from '@mui/material';

const AlertNotification = ({ alertInfo, setAlertInfo }) => {
    return (
        <Collapse in={alertInfo.open}>
            <Alert
                severity={alertInfo.severity}
                onClose={() => setAlertInfo({...alertInfo, open: false})}
                sx={{ mb: 2 }}
            >
                {alertInfo.message}
            </Alert>
        </Collapse>
    );
};

export default AlertNotification;