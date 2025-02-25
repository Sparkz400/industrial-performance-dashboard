import React, { useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
    Box,
    Divider,
    Drawer,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SettingsIcon from '@mui/icons-material/Settings';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import BurgerButton from './burgerButton.jsx';

// Simple debounce function.
function debounce(func, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            func(...args);
        }, delay);
    };
}

const ResponsiveSidebar = ({ open, onToggle, onWidthChange }) => {
    const theme = useTheme();
    const contentRef = useRef(null);

    const measureWidth = useCallback(() => {
        if (!contentRef.current) return 0;
        const contentWidth = contentRef.current.scrollWidth;
        const maxSidebarWidth = window.innerWidth * 0.5;
        return Math.min(contentWidth, maxSidebarWidth);
    }, []);

    useEffect(() => {
        // Measure and update sidebar width when open changes.
        requestAnimationFrame(() => {
            const w = measureWidth();
            onWidthChange(w);
        });

        // Debounced resize handler.
        const handleResize = () => {
            const w = measureWidth();
            onWidthChange(w);
        };
        const debouncedHandleResize = debounce(handleResize, 200);
        window.addEventListener('resize', debouncedHandleResize);
        return () => window.removeEventListener('resize', debouncedHandleResize);
    }, [open, measureWidth, onWidthChange]);

    return (
        <Drawer
            variant="persistent"
            open={true} // Always open from MUI's perspective; we control the width.
            PaperProps={{
                sx: {
                    position: 'fixed',
                    overflowX: 'hidden',
                    height: '100vh',
                },
            }}
            sx={{ flexShrink: 0 }}
        >
            <Divider />
            <Box
                ref={contentRef}
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    backgroundColor: theme.palette.primary.main,
                    color: theme.palette.common.white,
                    whiteSpace: 'nowrap',
                    py: 1,
                    px: 0,
                }}
            >
                <List disablePadding sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                    {/* Burger button */}
                    <ListItem disablePadding sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1 }}>
                        <BurgerButton checked={open} onChange={onToggle} />
                    </ListItem>
                    <Divider />
                    {/* Navigation items */}
                    <ListItem disablePadding>
                        <ListItemButton component={Link} to="/">
                            <ListItemIcon sx={{ color: theme.palette.common.white }}>
                                <DashboardIcon />
                            </ListItemIcon>
                            {open && <ListItemText primary="Dashboard" />}
                        </ListItemButton>
                    </ListItem>
                    <Divider />
                    <Box sx={{ flexGrow: 1 }} />
                    <Divider />
                    <ListItem disablePadding>
                        <ListItemButton component={Link} to="/settings">
                            <ListItemIcon sx={{ color: theme.palette.common.white }}>
                                <SettingsIcon />
                            </ListItemIcon>
                            {open && <ListItemText primary="Settings" />}
                        </ListItemButton>
                    </ListItem>
                    <ListItem disablePadding>
                        <ListItemButton component={Link} to="/help">
                            <ListItemIcon sx={{ color: theme.palette.common.white }}>
                                <HelpOutlineIcon />
                            </ListItemIcon>
                            {open && <ListItemText primary="Help" />}
                        </ListItemButton>
                    </ListItem>
                </List>
            </Box>
        </Drawer>
    );
};

export default ResponsiveSidebar;
