import React, { useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    Brush
} from 'recharts';
import { Card, CardContent, Typography, Box, CircularProgress } from '@mui/material';

// Map numeric operation mode values to labels
export const modeMapping = {
    0: "Off",
    1: "Error State",
    2: "Setup Mode",
    3: "Auto (Not Started)",
    4: "Auto (Started & Idle)",
    5: "Auto (In Production)"
};

/**
 * Presentational component for Operation Mode Widget
 */
const OperationModeWidgetView = ({
                                     data,
                                     loading,
                                     error,
                                     lastUpdated,
                                     config,
                                     onRefresh
                                 }) => {
    const { showBrush = true } = config || {};

    // Show loading state
    if (loading && data.length === 0) {
        return (
            <Card style={{ width: '100%', height: '100%' }}>
                <CardContent style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%'
                }}>
                    <CircularProgress size={40} />
                    <Typography variant="body2" sx={{ mt: 2 }}>
                        Loading operation mode data...
                    </Typography>
                </CardContent>
            </Card>
        );
    }

    // Show error state
    if (error && data.length === 0) {
        return (
            <Card style={{ width: '100%', height: '100%' }}>
                <CardContent style={{
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    padding: '16px'
                }}>
                    <Typography variant="h6" color="error" gutterBottom>
                        Error Loading Data
                    </Typography>
                    <Typography variant="body2">
                        {error}
                    </Typography>
                    <Box sx={{ mt: 2 }}>
                        <button onClick={onRefresh} className="no-drag">
                            Retry
                        </button>
                    </Box>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card style={{ width: '100%', height: '100%' }}>
            <CardContent
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    padding: '16px'
                }}
            >
                <Box sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 1
                }}>
                    <Typography variant="h6">
                        Operation Mode Over Time
                    </Typography>
                    {loading && (
                        <CircularProgress size={20} sx={{ ml: 1 }} />
                    )}
                </Box>

                {lastUpdated && (
                    <Typography variant="caption" color="text.secondary">
                        Last updated: {lastUpdated.toLocaleTimeString()}
                    </Typography>
                )}

                <Box
                    sx={{
                        flexGrow: 1,
                        width: '100%',
                        minHeight: '200px',
                        height: '100%',
                        position: 'relative'
                    }}
                >
                    {data.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                                data={data}
                                margin={{ top: 20, right: 30, left: 20, bottom: showBrush ? 40 : 5 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="time" minTickGap={20} />
                                <YAxis
                                    tickFormatter={(value) => modeMapping[value] || value}
                                    ticks={[0, 1, 2, 3, 4, 5]}
                                    domain={[0, 5]}
                                />
                                <Tooltip
                                    formatter={(value, name) => {
                                        return name === "mode" ?
                                            [modeMapping[value] || value, "Mode"] :
                                            [value, name];
                                    }}
                                />
                                <Legend />
                                <Line
                                    type="step"
                                    dataKey="mode"
                                    stroke="#82ca9d"
                                    strokeWidth={2}
                                    dot
                                    name="Operation Mode"
                                />
                                {showBrush && (
                                    <Brush
                                        dataKey="time"
                                        className="no-drag"
                                        height={30}
                                        stroke="#82ca9d"
                                        y={undefined}
                                        startIndex={Math.max(0, data.length - 50)}
                                        endIndex={data.length - 1}
                                    />
                                )}
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <Box sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%'
                        }}>
                            <Typography variant="body2" color="text.secondary">
                                No operation mode data available
                            </Typography>
                        </Box>
                    )}
                </Box>
            </CardContent>
        </Card>
    );
};

OperationModeWidgetView.propTypes = {
    data: PropTypes.arrayOf(
        PropTypes.shape({
            time: PropTypes.string,
            mode: PropTypes.number
        })
    ),
    loading: PropTypes.bool,
    error: PropTypes.string,
    lastUpdated: PropTypes.instanceOf(Date),
    config: PropTypes.shape({
        maxPoints: PropTypes.number,
        showBrush: PropTypes.bool
    }),
    onRefresh: PropTypes.func
};

OperationModeWidgetView.defaultProps = {
    data: [],
    loading: false,
    error: null,
    lastUpdated: null,
    config: {
        maxPoints: 120,
        showBrush: true
    },
    onRefresh: () => {}
};

export default React.memo(OperationModeWidgetView);