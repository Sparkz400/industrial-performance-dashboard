import { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import { API_ENDPOINTS, WEBSOCKET_ADDR } from '../../config/config';

/**
 * Custom hook for fetching and managing operation mode data
 * @param {Object} options - Hook configuration options
 * @returns {Object} Data, loading state, error and utilities
 */
export function useOperationModeData(options = {}) {
    const { maxPoints = 120 } = options;

    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

    const socketRef = useRef(null);
    const isSocketConnected = useRef(false);

    // Add a new data point
    const addDataPoint = useCallback((newPoint) => {
        setData(prevData => {
            const updated = [...prevData, newPoint];
            console.log("Adding data point, new length:", updated.length);
            return updated.length > maxPoints ?
                updated.slice(updated.length - maxPoints) :
                updated;
        });
        setLastUpdated(new Date());
    }, [maxPoints]);

    // Fetch historical data
    const fetchHistoricalData = useCallback(async () => {
        try {
            console.log("Fetching operation mode data...");
            setLoading(true);
            const response = await fetch(API_ENDPOINTS.operationModeData);

            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }

            const historicalData = await response.json();
            console.log("Received data:", historicalData.length, "data points");

            // Fall back to mock data if the API returns empty
            if (historicalData.length === 0) {
                console.log("No data from API, using mock data");
                const mockData = generateMockData();
                setData(mockData);
            } else {
                setData(historicalData);
            }

            setLastUpdated(new Date());
            setError(null);
        } catch (err) {
            console.error("Error fetching operation mode data:", err);
            setError(err.message);

            // Fall back to mock data on error
            console.log("Error fetching data, using mock data");
            const mockData = generateMockData();
            setData(mockData);
        } finally {
            setLoading(false);
        }
    }, []);

    // Generate mock data for testing
    const generateMockData = () => {
        console.log("Generating mock data");
        const mockData = [];
        const now = new Date();

        for (let i = 60; i >= 0; i--) {
            const time = new Date(now.getTime() - i * 60000);
            mockData.push({
                time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                mode: Math.floor(Math.random() * 6) // 0-5 for all operation modes
            });
        }

        return mockData;
    };

    // Setup socket connection for real-time updates
    useEffect(() => {
        // Fetch initial historical data
        fetchHistoricalData();

        // Setup socket connection
        if (!socketRef.current && !isSocketConnected.current) {
            console.log("Setting up socket connection");
            try {
                socketRef.current = io(WEBSOCKET_ADDR);
                isSocketConnected.current = true;

                const handleOpcuaUpdate = (nodeData) => {
                    if (nodeData.key === "OperationMode" || nodeData.key === "operationMode") {
                        console.log("Received OPCUA update:", nodeData);
                        const now = new Date();
                        const newPoint = {
                            time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                            mode: nodeData.value
                        };
                        addDataPoint(newPoint);
                    }
                };

                socketRef.current.on("opcuaUpdate", handleOpcuaUpdate);
                console.log("Socket event listener added");
            } catch (err) {
                console.error("Error setting up socket:", err);
            }
        }

        // Cleanup function
        return () => {
            console.log("Cleaning up socket connection");
            if (socketRef.current) {
                socketRef.current.off("opcuaUpdate");
                socketRef.current.disconnect();
                socketRef.current = null;
                isSocketConnected.current = false;
            }
        };
    }, [fetchHistoricalData, addDataPoint]);

    return {
        data,
        loading,
        error,
        lastUpdated,
        refresh: fetchHistoricalData
    };
}