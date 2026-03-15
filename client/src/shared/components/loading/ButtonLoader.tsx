import React from 'react';
import { Button, CircularProgress, ButtonProps } from '@mui/material';

interface ButtonLoaderProps extends Omit<ButtonProps, 'color' | 'size' | 'variant'> {
  loading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  loadingText?: string | null;
  startIcon?: React.ReactNode;
  size?: 'small' | 'medium' | 'large';
  variant?: 'text' | 'outlined' | 'contained';
  color?: 'inherit' | 'primary' | 'secondary' | 'success' | 'error' | 'info' | 'warning';
  fullWidth?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}

/**
 * Button with loading state for form submissions and actions
 * @param root0
 * @param root0.loading
 * @param root0.disabled
 * @param root0.children
 * @param root0.loadingText
 * @param root0.startIcon
 * @param root0.size
 * @param root0.variant
 * @param root0.color
 * @param root0.fullWidth
 * @param root0.onClick
 */
const ButtonLoader: React.FC<ButtonLoaderProps> = ({
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
    <CircularProgress size={size === 'small' ? 16 : size === 'large' ? 24 : 20} color="inherit" />
  ) : (
    startIcon
  );

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

export default ButtonLoader;
