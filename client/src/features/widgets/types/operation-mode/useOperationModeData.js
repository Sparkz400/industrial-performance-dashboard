import { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import { API_ENDPOINTS, WEBSOCKET_ADDR } from '../../../../config/config.js';

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
            return updated.length > maxPoints ?
                updated.slice(updated.length - maxPoints) :
                updated;
        });
        setLastUpdated(new Date());
    }, [maxPoints]);

    // Fetch historical data
    const fetchHistoricalData = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch(API_ENDPOINTS.operationModeData);

            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }

            const historicalData = await response.json();

            if (historicalData.length !== 0) {
                setData(historicalData);
            }

            setLastUpdated(new Date());
            setError(null);
        } catch (err) {
            console.error("Error fetching operation mode data:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);


    // Setup socket connection for real-time updates
    useEffect(() => {
        // Fetch initial historical data
        void fetchHistoricalData();

        // Setup socket connection
        if (!socketRef.current && !isSocketConnected.current) {
            try {
                socketRef.current = io(WEBSOCKET_ADDR);
                isSocketConnected.current = true;

                const handleOpcuaUpdate = (nodeData) => {
                    if (nodeData.key === "OperationMode" || nodeData.key === "operationMode") {
                        const now = new Date();
                        const newPoint = {
                            time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                            mode: nodeData.value
                        };
                        addDataPoint(newPoint);
                    }
                };

                socketRef.current.on("opcuaUpdate", handleOpcuaUpdate);
            } catch (err) {
                console.error("Error setting up socket:", err);
            }
        }

        // Cleanup function
        return () => {
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