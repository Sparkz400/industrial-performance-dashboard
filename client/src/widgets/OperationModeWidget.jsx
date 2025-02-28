import React, { useState, useEffect, useRef, useMemo } from 'react';
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
import { Card, CardContent, Typography, Box } from '@mui/material';
import io from 'socket.io-client';
import { API_ENDPOINTS, WEBSOCKET_ADDR } from '../config/config';

// Map numeric operation mode values to labels.
const modeMapping = {
    0: "Off",
    1: "Error State",
    2: "Setup Mode",
    3: "Auto (Not Started)",
    4: "Auto (Started & Idle)",
    5: "Auto (In Production)"
};

const OperationModeWidget = () => {
    const [data, setData] = useState([]);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const containerRef = useRef(null);
    const isSocketConnected = useRef(false);
    const socket = useRef(null);

    // Maximum number of data points to keep.
    const MAX_POINTS = 120;

    // Function to add a new data point and keep history within MAX_POINTS.
    const addDataPoint = (newPoint) => {
        setData((prevData) => {
            const updated = [...prevData, newPoint];
            return updated.length > MAX_POINTS ? updated.slice(updated.length - MAX_POINTS) : updated;
        });
    };

    // Measure container size after mount
    useEffect(() => {
        if (containerRef.current) {
            const updateSize = () => {
                const { clientWidth, clientHeight } = containerRef.current;
                setContainerSize({
                    width: clientWidth,
                    height: clientHeight
                });
            };

            // Update size on mount
            updateSize();

            // Also update on window resize
            window.addEventListener('resize', updateSize);

            // Cleanup
            return () => window.removeEventListener('resize', updateSize);
        }
    }, []);

    // Fetch historical data from API on mount.
    useEffect(() => {
        async function fetchHistoricalData() {
            try {
                const response = await fetch(API_ENDPOINTS.operationModeData);
                if (response.ok) {
                    const historicalData = await response.json();
                    setData(historicalData);
                } else {
                    console.error("Error fetching operation mode data:", response.status);
                }
            } catch (error) {
                console.error("Error fetching historical operation mode data:", error);
            }
        }
        fetchHistoricalData();
    }, []);

    // Subscribe to real-time updates via Socket.IO.
    useEffect(() => {
        // Only set up the socket connection once
        if (isSocketConnected.current) return;

        // Create socket connection
        socket.current = io(WEBSOCKET_ADDR);
        isSocketConnected.current = true;

        const handleOpcuaUpdate = (nodeData) => {
            // Process only updates for operation mode.
            if (nodeData.key === "OperationMode" || nodeData.key === "operationMode") {
                const now = new Date();
                const newPoint = {
                    time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    mode: nodeData.value
                };
                addDataPoint(newPoint);
            }
        };

        // Set up the event listener
        socket.current.on("opcuaUpdate", handleOpcuaUpdate);

        // Cleanup function
        return () => {
            if (socket.current) {
                socket.current.off("opcuaUpdate", handleOpcuaUpdate);
                socket.current.disconnect();
                isSocketConnected.current = false;
            }
        };
    }, []); // Empty dependency array - only run once

    // Memoize the data to prevent unnecessary re-renders
    const chartData = useMemo(() => data, [data]);

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
                <Typography variant="h6" gutterBottom>
                    Operation Mode Over Time
                </Typography>

                <Box
                    ref={containerRef}
                    sx={{
                        flexGrow: 1,
                        width: '100%',
                        minHeight: '250px',
                        position: 'relative'
                    }}
                >
                    {containerSize.width > 0 && containerSize.height > 0 && (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                                data={chartData}
                                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="time" minTickGap={20} />
                                <YAxis
                                    tickFormatter={(value) => modeMapping[value] || value}
                                    ticks={[0, 1, 2, 3, 4, 5]}
                                    domain={[0, 5]}
                                />
                                <Tooltip formatter={(value, name) => name === "mode" ? modeMapping[value] : value} />
                                <Legend />
                                <Line
                                    type="step"
                                    dataKey="mode"
                                    stroke="#82ca9d"
                                    strokeWidth={2}
                                    dot
                                />
                                <Brush
                                    dataKey="time"
                                    className="no-drag"
                                    height={30}
                                    stroke="#82ca9d"
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </Box>
            </CardContent>
        </Card>
    );
};

export default OperationModeWidget;