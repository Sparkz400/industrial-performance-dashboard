import React from 'react';
import { Dialog, DialogTitle, DialogContent, Paper, Typography } from '@mui/material';
import { widgetRegistry } from '../../widgets/WidgetRegistry';
import Grid from '@mui/material/Grid2';

const WidgetPreviewPopup = ({ open, onClose, onSelect }) => {
    const widgetTypes = Object.keys(widgetRegistry);
    // Assume a row height of 35px as used in your grid layout.
    const rowHeight = 35;

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle>Select a Widget</DialogTitle>
            <DialogContent
                dividers
                style={{ overflowY: 'auto', overflowX: 'hidden', maxHeight: '80vh' }}
            >
                <Grid container spacing={2}>
                    {widgetTypes.map((widgetType) => {
                        const widgetMeta = widgetRegistry[widgetType];
                        const WidgetComponent = widgetMeta.component;
                        // Calculate preview height based on the widget's minimum height.
                        const previewHeight = widgetMeta.minH ? widgetMeta.minH * rowHeight : 150;
                        return (
                            <Grid item xs={12} sm={6} md={4} key={widgetType}>
                                <Paper
                                    elevation={3}
                                    onClick={() => onSelect(widgetType)}
                                    style={{
                                        padding: '1rem',
                                        cursor: 'pointer',
                                        textAlign: 'center'
                                    }}
                                >
                                    <Typography variant="h6" gutterBottom>
                                        {widgetType}
                                    </Typography>
                                    <div style={{ width: '100%', height: previewHeight }}>
                                        <WidgetComponent config={{}} />
                                    </div>
                                    {widgetMeta.minW && widgetMeta.minH && (
                                        <Typography variant="caption" display="block">
                                            {`Min size: ${widgetMeta.minW} x ${widgetMeta.minH}`}
                                        </Typography>
                                    )}
                                </Paper>
                            </Grid>
                        );
                    })}
                </Grid>
            </DialogContent>
        </Dialog>
    );
};

export default WidgetPreviewPopup;
