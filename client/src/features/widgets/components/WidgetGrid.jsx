import React from 'react';
import {Box, Chip, CircularProgress, Divider, Typography} from '@mui/material';
import VirtualizedGrid from '../../../shared/components/VirtualizeGrid.jsx';
import PropTypes from "prop-types";

// Widget card component
const WidgetCard = React.memo(({ widget, onClick }) => {
    const previewHeight = widget.minH ? widget.minH * 35 : 150; // Using standard row height

    return (
        <Box
            sx={{
                height: '100%',
                m: 1, // Add margin around each card
                backgroundColor: 'background.paper',
                borderRadius: 1,
                boxShadow: 3,
                overflow: 'hidden',
                cursor: 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 6
                }
            }}
            onClick={onClick}
        >
            <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography component="h3" sx={{ m: 0, fontSize: '1rem', fontWeight: 'bold', maxWidth: '80%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {widget.title || widget.type}
                    </Typography>
                    <Chip
                        label={widget.category || 'Misc'}
                        size="small"
                        color="primary" // Or choose color based on category
                        sx={{ flexShrink: 0 }} // Prevent chip from shrinking too much
                    />
                </Box>

                {widget.description && (
                    <Typography
                        component="p"
                        sx={{
                            mb: 1, // Reduced margin
                            color: 'text.secondary',
                            fontSize: '0.875rem',
                            height: '2.5em', // Approx 2 lines
                            lineHeight: 1.25,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            m: 0
                        }}
                    >
                        {widget.description}
                    </Typography>
                )}

                {/* Add divider if description exists */}
                {widget.description && <Divider sx={{ my: 1 }} />}

                {/* Preview Area */}
                <Box sx={{ height: previewHeight, position: 'relative', flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {/* Handle cases where component might not load */}
                    {widget.component ? (
                        <React.Suspense fallback={
                            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                                <CircularProgress size={24} />
                            </Box>
                        }>
                            {/* Scale down the preview slightly if needed */}
                            <Box sx={{ transform: 'scale(0.9)', transformOrigin: 'center center', width: '100%', height: '100%' }}>
                                <widget.component config={widget.defaultConfig || {}} />
                            </Box>
                        </React.Suspense>
                    ) : (
                        <Typography variant="caption" color="error">Preview unavailable</Typography>
                    )}
                </Box>

                {widget.minW && widget.minH && (
                    <Typography
                        component="p"
                        sx={{
                            mt: 'auto', // Push to bottom
                            pt: 1, // Add padding top
                            textAlign: 'right',
                            fontSize: '0.75rem',
                            color: 'text.secondary',
                            m: 0
                        }}
                    >
                        {`Min size: ${widget.minW} x ${widget.minH}`}
                    </Typography>
                )}
            </Box>
        </Box>
    );
});
WidgetCard.displayName = "WidgetCard"; // Add display name


// Accept useVirtualization as a prop
const WidgetGrid = ({ widgets, onSelectWidget, isLoading, useVirtualization }) => {

    if (isLoading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    if (useVirtualization) {
        // Estimate row height based on card content + margins
        const estimatedRowHeight = 320; // Adjust this based on your WidgetCard's actual rendered height
        return (
            // Ensure the container has explicit height for AutoSizer
            <Box sx={{ height: '100%', width: '100%', p: 1 }}>
                <VirtualizedGrid
                    items={widgets}
                    columnCount={4} // Adjust based on desired layout
                    rowHeight={estimatedRowHeight}
                    renderItem={({ item, style }) => ( // Pass style to the card wrapper
                        <Box style={style}> {/* Apply style here */}
                            <WidgetCard
                                widget={item}
                                onClick={() => onSelectWidget(item.type)}
                            />
                        </Box>
                    )}
                />
            </Box>
        );
    }

    // Regular grid for smaller lists
    return (
        <Box sx={{ p: 2 }}> {/* Add padding around the grid */}
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                        xs: 'repeat(auto-fill, minmax(250px, 1fr))', // Responsive columns
                        // sm: 'repeat(2, 1fr)',
                        // md: 'repeat(3, 1fr)',
                        // lg: 'repeat(4, 1fr)'
                    },
                    gap: 2 // Use theme spacing unit
                }}
            >
                {widgets.map((widget) => (
                    <WidgetCard
                        key={widget.type}
                        widget={widget}
                        onClick={() => onSelectWidget(widget.type)}
                    />
                ))}
            </Box>
        </Box>
    );
};

WidgetGrid.propTypes = {
    widgets: PropTypes.array.isRequired,
    onSelectWidget: PropTypes.func.isRequired,
    isLoading: PropTypes.bool,
    useVirtualization: PropTypes.bool.isRequired, // Make it required
};

WidgetGrid.defaultProps = {
    isLoading: false
};

export default WidgetGrid;