import React, { useState } from 'react';
import {Paper, IconButton, Dialog, DialogTitle, DialogContent, Typography, Button, DialogActions} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SettingsIcon from '@mui/icons-material/Settings';
import CloseIcon from '@mui/icons-material/Close'

const WidgetContainer = ({ widget, onDelete, widgetRegistry, layoutItem, onUpdateWidgetConfig  }) => {
    const widgetMeta = widgetRegistry[widget.type];
    const WidgetComponent = widgetMeta.component;
    const CustomSettingsComponent = widgetMeta.settingsComponent; // Optional custom settings

    const [openSettings, setOpenSettings] = useState(false);

    const handleOpenSettings = () => setOpenSettings(true);
    const handleCloseSettings = () => setOpenSettings(false);

    const handleConfigChange = (newConfig) => {
        onUpdateWidgetConfig(widget.id, newConfig);
    };

    return (
        <div style={{ position: 'relative', height: '100%' }}>
            <Paper elevation={3} style={{ height: '100%', position: 'relative' }}>
                {/* Render the widget's content */}
                <WidgetComponent config={widget.config} />

                {/* Floating control buttons */}
                <div
                    style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        display: 'flex',
                        gap: '4px',
                        zIndex: 10,
                    }}
                >
                    <IconButton
                        onClick={handleOpenSettings}
                        aria-label="settings"
                        style={{ background: 'rgba(131,131,131,0.8)' }}
                        size="small"
                    >
                        <SettingsIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                        onClick={onDelete}
                        aria-label="delete"
                        style={{ background: 'rgba(131,131,131,0.8)' }}
                        size="small"
                    >
                        <DeleteIcon fontSize="small" />
                    </IconButton>
                </div>

                {/* Debug overlay showing layout dimensions */}
                {layoutItem && (
                    <div
                        style={{
                            position: 'absolute',
                            bottom: '2px',
                            left: '2px',
                            fontSize: '10px',
                            color: 'white',
                            background: 'rgba(0, 0, 0, 0.5)',
                            padding: '2px 4px',
                            borderRadius: '2px',
                            zIndex: 10,
                        }}
                    >
                        {`w: ${layoutItem.w}, h: ${layoutItem.h}`}
                    </div>
                )}
            </Paper>

            {/* Settings dialog */}
            <Dialog open={openSettings} onClose={handleCloseSettings} fullWidth maxWidth="sm" className="no-drag">
                <DialogTitle>{widget.type} Settings</DialogTitle>
                <DialogContent dividers>
                    {CustomSettingsComponent ? (
                        <CustomSettingsComponent
                            config={widget.config}
                            onConfigChange={handleConfigChange}
                        />
                    ) : (
                        <Typography variant="body1">No custom settings available for this widget.</Typography>
                    )}
                </DialogContent>

                <DialogActions>
                    <Button onClick={handleCloseSettings}
                            variant="outlined"
                            color="rgba(0, 0, 0, 0.5)"
                    >
                        Close
                    </Button>
                </DialogActions>

            </Dialog>
        </div>
    );
};

export default WidgetContainer;
