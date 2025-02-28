// Create this as a new file: src/widgets/StandardComponents/WidgetGrid.jsx

import React from 'react';
import { Box, CircularProgress } from '@mui/material';

// Simple grid component that doesn't use MUI Grid to avoid prop type issues
const WidgetGrid = ({ widgets, onSelectWidget, isLoading }) => {
    return (
        <Box sx={{ p: 1 }}>
            {isLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                    <CircularProgress />
                </Box>
            ) : (
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: {
                            xs: 'repeat(1, 1fr)',
                            sm: 'repeat(2, 1fr)',
                            md: 'repeat(3, 1fr)',
                            lg: 'repeat(4, 1fr)'
                        },
                        gap: 3
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
            )}
        </Box>
    );
};

// Widget card component
const WidgetCard = React.memo(({ widget, onClick }) => {
    const WidgetComponent = widget.component;
    const previewHeight = widget.minH ? widget.minH * 35 : 150; // Using standard row height

    return (
        <Box
            sx={{
                height: '100%',
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
            <Box sx={{ p: 2 }}>
                <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box component="h3" sx={{ m: 0, fontSize: '1rem', fontWeight: 'bold', maxWidth: '80%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {widget.title || widget.type}
                    </Box>
                    <Box
                        sx={{
                            fontSize: '0.7rem',
                            fontWeight: 'medium',
                            bgcolor: 'primary.main',
                            color: 'primary.contrastText',
                            borderRadius: '12px',
                            px: 1,
                            py: 0.5,
                        }}
                    >
                        {widget.category || 'Misc'}
                    </Box>
                </Box>

                {widget.description && (
                    <Box
                        component="p"
                        sx={{
                            mb: 2,
                            color: 'text.secondary',
                            fontSize: '0.875rem',
                            height: '2.5em',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            m: 0
                        }}
                    >
                        {widget.description}
                    </Box>
                )}

                <Box
                    sx={{
                        borderTop: 1,
                        borderColor: 'divider',
                        pt: 2,
                        mt: 2
                    }}
                />

                <Box sx={{ height: previewHeight, position: 'relative' }}>
                    <React.Suspense fallback={
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                            <CircularProgress size={24} />
                        </Box>
                    }>
                        <WidgetComponent config={widget.defaultConfig || {}} />
                    </React.Suspense>
                </Box>

                {widget.minW && widget.minH && (
                    <Box
                        component="p"
                        sx={{
                            mt: 1,
                            textAlign: 'right',
                            fontSize: '0.75rem',
                            color: 'text.secondary',
                            m: 0
                        }}
                    >
                        {`Min size: ${widget.minW} x ${widget.minH}`}
                    </Box>
                )}
            </Box>
        </Box>
    );
});

export default WidgetGrid;
export { WidgetCard };