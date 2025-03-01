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
import PropTypes from 'prop-types';
import { Card, CardContent, Typography } from '@mui/material';

const generateInitialData = () => {
    const data = [];
    const now = new Date();
    // Generate one data point per minute for the past 24 hours (1440 minutes)
    for (let i = 1440; i >= 0; i--) {
        const time = new Date(now.getTime() - i * 60000);
        data.push({
            time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            airConsumption: Math.floor(Math.random() * 100) + 100 // dummy value between 100 and 199
        });
    }
    return data;
};

const CurrentAirConsumptionWidget = ({ config }) => {
    const [data, setData] = useState(generateInitialData());

    // Simulate live updates: every minute, remove the oldest point and add a new one.
    useEffect(() => {
        const interval = setInterval(() => {
            setData(prevData => {
                const newData = [...prevData];
                newData.shift();
                const now = new Date();
                newData.push({
                    time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    airConsumption: Math.floor(Math.random() * 100) + 100
                });
                return newData;
            });
        }, 60000);
        return () => clearInterval(interval);
    }, []);

    // Since we have one data point per minute, the last 5 minutes equal the last 5 data points.
    const defaultStartIndex = data.length >= 5 ? data.length - 5 : 0;
    const defaultEndIndex = data.length - 1;

    return (
        <Card style={{ width: '100%', height: '100%' }}>
            <CardContent style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Typography variant="h6" gutterBottom>
                    Air Consumption (Last 24 Hours)
                </Typography>
                {/* Container that fills available space */}
                <div style={{ flexGrow: 1 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="time" minTickGap={20} />
                            <YAxis/>
                            <Tooltip formatter={(value) => `${value} m³/h`} />
                            <Legend />
                            <Line
                                type="monotone"
                                dataKey="airConsumption"
                                stroke="#8884d8"
                                strokeWidth={2}
                                name="Air Consumption (m³/h)"
                            />
                            <Brush
                                dataKey="time"
                                className="no-drag"
                                startIndex={defaultStartIndex}
                                endIndex={defaultEndIndex}
                                height={30}
                                stroke="#8884d8"
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
                <Typography variant="body2" color="textSecondary">
                    Use the brush above to scroll back up to 24 hours.
                </Typography>
            </CardContent>
        </Card>
    );
};

// Add prop validation
CurrentAirConsumptionWidget.propTypes = {
    config: PropTypes.shape({
        refreshInterval: PropTypes.number,
        showBrush: PropTypes.bool,
        dataPoints: PropTypes.number
    })
};

CurrentAirConsumptionWidget.defaultProps = {
    config: {
        refreshInterval: 60000,
        showBrush: true,
        dataPoints: 1440
    }
};

export default CurrentAirConsumptionWidget;
