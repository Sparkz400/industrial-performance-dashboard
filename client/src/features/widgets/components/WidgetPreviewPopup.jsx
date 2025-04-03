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
    Chip,
    IconButton
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';

import { widgetRegistry, getWidgetsByCategory } from '../registry/WidgetRegistry.js';
import WidgetGrid from './WidgetGrid.jsx';

const dialogStyles = {
    maxWidth: '90vw',
    maxHeight: '85vh',
    width: 'calc(100% - 64px)',
    height: 'calc(100% - 64px)',
    m: '32px',
};

const WidgetPreviewPopup = ({ open, onClose, onSelect }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [currentTab, setCurrentTab] = useState(0);

    // Organize widgets by category
    const categorizedWidgets = useMemo(() => {
        const categories = getWidgetsByCategory();
        const allWidgets = Object.entries(widgetRegistry).map(([key, widget]) => ({ type: key, ...widget }));
        return { All: allWidgets, ...categories };
    }, []);

    const tabNames = useMemo(() => Object.keys(categorizedWidgets), [categorizedWidgets]);

    // Filter widgets based on search query
    const filteredWidgets = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return categorizedWidgets;

        const filtered = {};

        Object.entries(categorizedWidgets).forEach(([category, widgets]) => {
            filtered[category] = widgets.filter(widget =>
                widget.title?.toLowerCase().includes(query) ||
                widget.description?.toLowerCase().includes(query) ||
                widget.type.toLowerCase().includes(query) ||
                widget.category?.toLowerCase().includes(query) // Also search category
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

    const currentCategoryWidgets = filteredWidgets[tabNames[currentTab]] || [];
    const useVirtualization = currentCategoryWidgets.length > 50;

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth
            maxWidth={false} // Allow PaperProps to control size
            PaperProps={{ sx: dialogStyles }} // Use sx prop for styles
            aria-labelledby="widget-preview-dialog-title"
        >
            <DialogTitle id="widget-preview-dialog-title">
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
                            startAdornment: ( <InputAdornment position="start"> <SearchIcon /> </InputAdornment> ),
                            endAdornment: searchQuery ? (
                                <InputAdornment position="end">
                                    <IconButton size="small" onClick={handleClearSearch} edge="end" aria-label="clear search">
                                        <CloseIcon fontSize="small" />
                                    </IconButton>
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
                    aria-label="widget categories"
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

            <DialogContent dividers sx={{ overflowY: 'auto', overflowX: 'hidden', p: 0 }}> {/* Remove padding */}
                <Box
                    role="tabpanel"
                    hidden={currentTab !== tabNames.indexOf(tabNames[currentTab])} // Ensure hidden logic is correct
                    id={`widget-tabpanel-${currentTab}`}
                    aria-labelledby={`widget-tab-${currentTab}`}
                    sx={{ height: '100%' }} // Ensure Box takes full height
                >
                    {currentCategoryWidgets.length === 0 ? (
                        <Box sx={{ p: 3, textAlign: 'center' }}>
                            <Typography color="textSecondary">
                                {searchQuery ? `No widgets found matching "${searchQuery}"` : 'No widgets in this category.'}
                            </Typography>
                        </Box>
                    ) : (
                        <WidgetGrid
                            // Pass the widgets for the currently selected tab
                            widgets={currentCategoryWidgets}
                            onSelectWidget={(widgetType) => {
                                onSelect(widgetType);
                                onClose();
                            }}
                            // Pass the virtualization flag
                            useVirtualization={useVirtualization}
                        />
                    )}
                </Box>
            </DialogContent>
        </Dialog>
    );
};

export default WidgetPreviewPopup;