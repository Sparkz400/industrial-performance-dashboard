// File: src/widgets/StandardComponents/WidgetPreviewPopup.jsx
import React, { useState, useMemo } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    Typography,
    TextField,
    Tab,
    Tabs,
    Box,
    InputAdornment,
    Chip
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';

import { widgetRegistry, getWidgetsByCategory } from './WidgetRegistry';
import WidgetGrid from './WidgetGrid';

const dialogStyles = {
    maxWidth: '90vw',
    maxHeight: '85vh',
};

const WidgetPreviewPopup = ({ open, onClose, onSelect }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [currentTab, setCurrentTab] = useState(0);

    // Organize widgets by category
    const categorizedWidgets = useMemo(() => {
        const categories = getWidgetsByCategory();

        // Add "All" category which includes all widgets
        const allWidgets = Object.entries(widgetRegistry).map(([key, widget]) => ({
            type: key,
            ...widget
        }));

        return {
            All: allWidgets,
            ...categories
        };
    }, []);

    // Get tab names from categorized widgets
    const tabNames = useMemo(() => Object.keys(categorizedWidgets), [categorizedWidgets]);

    // Filter widgets based on search query
    const filteredWidgets = useMemo(() => {
        if (!searchQuery.trim()) {
            return categorizedWidgets;
        }

        const query = searchQuery.toLowerCase();
        const filtered = {};

        Object.entries(categorizedWidgets).forEach(([category, widgets]) => {
            filtered[category] = widgets.filter(widget =>
                widget.title?.toLowerCase().includes(query) ||
                widget.description?.toLowerCase().includes(query) ||
                widget.type.toLowerCase().includes(query)
            );
        });

        return filtered;
    }, [categorizedWidgets, searchQuery]);

    // Handle tab change
    const handleTabChange = (event, newValue) => {
        setCurrentTab(newValue);
    };

    // Clear search query
    const handleClearSearch = () => {
        setSearchQuery('');
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth
            maxWidth="lg"
            PaperProps={{ style: dialogStyles }}
        >
            <DialogTitle>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="h5">Add Widget to Dashboard</Typography>
                    <TextField
                        placeholder="Search widgets..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        variant="outlined"
                        size="small"
                        sx={{ width: '300px' }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon />
                                </InputAdornment>
                            ),
                            endAdornment: searchQuery ? (
                                <InputAdornment position="end">
                                    <Box
                                        component="span"
                                        sx={{
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center'
                                        }}
                                        onClick={handleClearSearch}
                                    >
                                        <CloseIcon fontSize="small" />
                                    </Box>
                                </InputAdornment>
                            ) : null
                        }}
                    />
                </Box>

                <Tabs
                    value={currentTab}
                    onChange={handleTabChange}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{ borderBottom: 1, borderColor: 'divider' }}
                >
                    {tabNames.map((tab, index) => (
                        <Tab
                            key={tab}
                            label={
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                    {tab}
                                    <Chip
                                        label={filteredWidgets[tab]?.length || 0}
                                        size="small"
                                        sx={{ ml: 1, height: '20px', minWidth: '20px' }}
                                    />
                                </Box>
                            }
                            id={`widget-tab-${index}`}
                            aria-controls={`widget-tabpanel-${index}`}
                        />
                    ))}
                </Tabs>
            </DialogTitle>

            <DialogContent dividers style={{ overflowY: 'auto', overflowX: 'hidden' }}>
                <Box
                    role="tabpanel"
                    id={`widget-tabpanel-${currentTab}`}
                    aria-labelledby={`widget-tab-${currentTab}`}
                >
                    {filteredWidgets[tabNames[currentTab]]?.length === 0 ? (
                        <Box sx={{ p: 3, textAlign: 'center' }}>
                            <Typography color="textSecondary">
                                No widgets found matching "{searchQuery}"
                            </Typography>
                        </Box>
                    ) : (
                        <WidgetGrid
                            widgets={filteredWidgets[tabNames[currentTab]] || []}
                            onSelectWidget={(widgetType) => {
                                onSelect(widgetType);
                                onClose();
                            }}
                        />
                    )}
                </Box>
            </DialogContent>
        </Dialog>
    );
};

export default WidgetPreviewPopup;