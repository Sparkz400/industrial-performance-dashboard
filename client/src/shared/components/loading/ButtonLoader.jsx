import React from 'react';
import PropTypes from 'prop-types';
import { Button, CircularProgress } from '@mui/material';

/**
 * Button with loading state for form submissions and actions
 */
const ButtonLoader = ({
                          loading = false,
                          disabled = false,
                          children,
                          loadingText = null,
                          startIcon = null,
                          size = 'medium',
                          variant = 'contained',
                          color = 'primary',
                          fullWidth = false,
                          onClick,
                          ...buttonProps
                      }) => {
    // Combine disabled state with loading
    const isDisabled = disabled || loading;

    // If loading, replace the start icon with a progress indicator
    const effectiveStartIcon = loading ? (
        <CircularProgress
            size={size === 'small' ? 16 : size === 'large' ? 24 : 20}
            color="inherit"
        />
    ) : startIcon;

    // If loading text is provided, and we're in loading state, show it
    const buttonText = loading && loadingText ? loadingText : children;

    return (
        <Button
            variant={variant}
            color={color}
            disabled={isDisabled}
            startIcon={effectiveStartIcon}
            onClick={!loading ? onClick : undefined}
            fullWidth={fullWidth}
            size={size}
            {...buttonProps}
        >
            {buttonText}
        </Button>
    );
};

ButtonLoader.propTypes = {
    loading: PropTypes.bool,
    disabled: PropTypes.bool,
    children: PropTypes.node.isRequired,
    loadingText: PropTypes.string,
    startIcon: PropTypes.node,
    size: PropTypes.oneOf(['small', 'medium', 'large']),
    variant: PropTypes.oneOf(['text', 'outlined', 'contained']),
    color: PropTypes.oneOf(['inherit', 'primary', 'secondary', 'success', 'error', 'info', 'warning']),
    fullWidth: PropTypes.bool,
    onClick: PropTypes.func
};

export default ButtonLoader;