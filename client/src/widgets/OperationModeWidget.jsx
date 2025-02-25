import React, { useState, useEffect } from 'react';
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
import { Card, CardContent, Typography } from '@mui/material';
import io from 'socket.io-client';
import { API_ENDPOINTS, WEBSOCKET_ADDR} from '../config/config';

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

    // Maximum number of data points to keep.
    const MAX_POINTS = 120;

    // Function to add a new data point and keep history within MAX_POINTS.
    const addDataPoint = (newPoint) => {
        setData((prevData) => {
            const updated = [...prevData, newPoint];
            return updated.length > MAX_POINTS ? updated.slice(updated.length - MAX_POINTS) : updated;
        });
    };

    // Fetch historical data from API on mount.
    useEffect(() => {
        async function fetchHistoricalData() {
            try {
                const response = await fetch(API_ENDPOINTS.operationModeData);
                const historicalData = await response.json();
                setData(historicalData);
            } catch (error) {
                console.error("Error fetching historical operation mode data:", error);
            }
        }
        fetchHistoricalData().then(() => {});
    }, []);

    // Subscribe to real-time updates via Socket.IO.
    useEffect(() => {
        const socket = io(WEBSOCKET_ADDR); // Adjust the URL if needed.

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

        socket.on("opcuaUpdate", handleOpcuaUpdate);

        return () => {
            socket.off("opcuaUpdate", handleOpcuaUpdate);
            socket.disconnect();
        };
    }, []);

    return (
        <Card style={{ width: '100%', height: '100%' }}>
            <CardContent style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Typography variant="h6" gutterBottom>
                    Operation Mode Over Time
                </Typography>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="time" minTickGap={20} />
                        <YAxis
                            tickFormatter={(value) => modeMapping[value] || value}
                            ticks={[0, 1, 2, 3, 4, 5]}
                            domain={[0, 5]}
                        />
                        <Tooltip formatter={(value, name) => name === "mode" ? modeMapping[value] : value} />
                        <Legend />
                        <Line type="step" dataKey="mode" stroke="#82ca9d" strokeWidth={2} dot />
                        <Brush dataKey="time" className="no-drag" height={30} stroke="#82ca9d" />
                    </LineChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
};

export default OperationModeWidget;
