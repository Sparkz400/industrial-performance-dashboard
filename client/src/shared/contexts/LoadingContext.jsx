import React, { createContext, useContext, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { LoadingOverlay } from '../components/loading';

// Create the loading context
const LoadingContext = createContext({
    setGlobalLoading: () => {},
    setLoadingMessage: () => {},
    isLoading: false
});

/**
 * Provider component for global loading state management
 */
export const LoadingProvider = ({ children }) => {
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);

    // Set loading state with optional message
    const setGlobalLoading = useCallback((isLoading, loadingMessage = null) => {
        setLoading(isLoading);
        setMessage(loadingMessage);
    }, []);

    // Update just the loading message
    const setLoadingMessage = useCallback((loadingMessage) => {
        setMessage(loadingMessage);
    }, []);

    // Value to be provided to context consumers
    const contextValue = {
        setGlobalLoading,
        setLoadingMessage,
        isLoading: loading
    };

    return (
        <LoadingContext.Provider value={contextValue}>
            {children}
            <LoadingOverlay open={loading} message={message} fullPage />
        </LoadingContext.Provider>
    );
};

LoadingProvider.propTypes = {
    children: PropTypes.node.isRequired
};

/**
 * Custom hook to use the loading context
 */
export const useLoading = () => {
    const context = useContext(LoadingContext);

    if (!context) {
        throw new Error('useLoading must be used within a LoadingProvider');
    }

    return context;
};

export default LoadingProvider;