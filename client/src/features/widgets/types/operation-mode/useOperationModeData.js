import { useState, useEffect, useCallback } from 'react';
import { API_ENDPOINTS } from '../../../../config/config.js';
import { useSystemStatus } from '../../../system/index.jsx';

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

    // Get the shared socket instance from context
    const { socket, socketConnected } = useSystemStatus();

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


    // Effect for real-time updates via WebSocket
    useEffect(() => {
        // Fetch initial historical data
        void fetchHistoricalData();

        // Only proceed if socket is available and connected
        if (socket && socketConnected) {
            const roomName = 'opcua-OperationMode'; // Room for this specific data type

            // Handler for receiving updates for this specific node
            const handleOpcuaUpdate = (nodeData) => {
                // No need to check nodeData.key here, as the server sends to the correct room
                const now = new Date();
                const newPoint = {
                    time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    mode: nodeData.value
                };
                addDataPoint(newPoint);
            };

            // Join the room when the component mounts or socket connects
            socket.emit('joinRoom', roomName);
            console.log(`[useOperationModeData] Joining room: ${roomName}`);

            // Listen for updates
            socket.on("opcuaUpdate", handleOpcuaUpdate);

            // Cleanup function: leave room and remove listener
            return () => {
                socket.emit('leaveRoom', roomName);
                console.log(`[useOperationModeData] Leaving room: ${roomName}`);
                socket.off("opcuaUpdate", handleOpcuaUpdate);
            };
        }
        // Re-run effect if socket instance or connection status changes
    }, [fetchHistoricalData, addDataPoint, socket, socketConnected]);

    return {
        data,
        loading,
        error,
        lastUpdated,
        refresh: fetchHistoricalData
    };
}