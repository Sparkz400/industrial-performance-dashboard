import React from 'react';
import { Dialog, DialogTitle, DialogContent, Paper, Typography } from '@mui/material';
import { widgetRegistry } from '../../widgets/WidgetRegistry';
import Grid from '@mui/material/Grid2';

const rowHeight = 35;

const dialogStyles = {
    maxWidth: '80vw',
    maxHeight: '80vh',
};

const renderWidgetGrid = (widgetTypes, onSelect) => {
    return widgetTypes.map((widgetType) => {
        const widgetMetadata = widgetRegistry[widgetType];
        const WidgetComponent = widgetMetadata.component;
        const previewHeight = widgetMetadata.minH ? widgetMetadata.minH * rowHeight : 150;

        return (
            <Grid item xs={12} sm={6} md={4} key={widgetType}>
                <Paper
                    elevation={3}
                    onClick={() => onSelect(widgetType)}
                    style={{
                        padding: '1rem',
                        cursor: 'pointer',
                        textAlign: 'center',
                    }}
                >
                    <Typography variant="h6" gutterBottom>
                        {widgetType}
                    </Typography>
                    <div style={{ width: '100%', height: previewHeight }}>
                        <WidgetComponent config={{}} />
                    </div>
                    {widgetMetadata.minW && widgetMetadata.minH && (
                        <Typography variant="caption" display="block">
                            {`Min size: ${widgetMetadata.minW} x ${widgetMetadata.minH}`}
                        </Typography>
                    )}
                </Paper>
            </Grid>
        );
    });
};

const WidgetPreviewPopup = ({ open, onClose, onSelect }) => {
    const widgetTypes = Object.keys(widgetRegistry);

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth
            PaperProps={{ style: dialogStyles }}
        >
            <DialogTitle>Select a Widget</DialogTitle>
            <DialogContent dividers style={{ overflowY: 'auto', overflowX: 'auto' }}>
                <Grid container spacing={3}>
                    {renderWidgetGrid(widgetTypes, onSelect)}
                </Grid>
            </DialogContent>
        </Dialog>
    );
};

export default WidgetPreviewPopup;
