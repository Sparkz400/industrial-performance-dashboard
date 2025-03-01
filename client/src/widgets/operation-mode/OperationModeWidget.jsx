import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import { useOperationModeData } from './useOperationModeData';
import OperationModeWidgetView from './OperationModeWidgetView';

/**
 * Container component for Operation Mode Widget
 */
const OperationModeWidget = ({ config = {}, onError }) => {
    // Extract configuration values with defaults
    const {
        maxPoints = 120,
        showBrush = true
    } = config;

    // Use custom hook for data fetching and state management
    const {
        data,
        loading,
        error,
        lastUpdated,
        refresh
    } = useOperationModeData({
        maxPoints
    });

    // Report errors to parent component if provided
    useEffect(() => {
        if (error && onError) {
            onError(new Error(`Operation Mode Widget error: ${error}`));
        }
    }, [error, onError]);

    // Simply pass all props to the view component
    return (
        <OperationModeWidgetView
            data={data}
            loading={loading}
            error={error}
            lastUpdated={lastUpdated}
            config={{ maxPoints, showBrush }}
            onRefresh={refresh}
        />
    );
};

OperationModeWidget.propTypes = {
    config: PropTypes.shape({
        maxPoints: PropTypes.number,
        showBrush: PropTypes.bool
    }),
    onError: PropTypes.func
};

OperationModeWidget.defaultProps = {
    config: {
        maxPoints: 120,
        showBrush: true
    }
};

export default OperationModeWidget;