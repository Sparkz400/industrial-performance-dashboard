import React, { useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
    Box,
    Divider,
    Drawer,
    List,
    ListItem, ListItemButton,
    ListItemIcon,
    ListItemText,
    Toolbar
} from '@mui/material';
import { useTheme } from '@mui/material/styles';

// Icons
import DashboardIcon from '@mui/icons-material/Dashboard';
import SettingsIcon from '@mui/icons-material/Settings';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

import BurgerButton from './burgerButton.jsx';

const ResponsiveSidebar = ({ open, onToggle, onWidthChange }) => {
    const theme = useTheme();
    const contentRef = useRef(null);

    // measureWidth calculates how wide the content is (text + icons, if open),
    // or icons only if open=false. We clamp to 50% viewport as an example.
    const measureWidth = useCallback(() => {
        if (!contentRef.current) return 0;
        const contentWidth = contentRef.current.scrollWidth;
        const maxSidebarWidth = window.innerWidth * 0.5;
        return Math.min(contentWidth, maxSidebarWidth);
    }, []);

    useEffect(() => {
        // Re-measure whenever open changes
        if (open) {
            // Let the text be visible, then measure
            requestAnimationFrame(() => {
                const w = measureWidth();
                onWidthChange(w);
            });
        } else {
            // With text hidden, measure again
            requestAnimationFrame(() => {
                const w = measureWidth();
                onWidthChange(w);
            });
        }

        const handleResize = () => {
            const w = measureWidth();
            onWidthChange(w);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [open, measureWidth, onWidthChange]);

    return (
        <Drawer
            variant="persistent"
            open={true}  // The drawer is always "open" from MUI's perspective, but we control the width with measure
            PaperProps={{
                sx: {
                    position: 'fixed',
                    overflowX: 'hidden',
                    height: '100vh',
                }
            }}
            sx={{ flexShrink: 0 }}
        >
            <Divider />

            <Box
                ref={contentRef}
                sx={{
                    display: 'flex',          // flex layout
                    flexDirection: 'column',  // stack items vertically
                    height: '100%',           // full available height
                    backgroundColor: theme.palette.primary.main,
                    color: theme.palette.common.white,
                    whiteSpace: 'nowrap',
                    py: 1,
                    px: 0
                }}
            >
                <List disablePadding
                      sx={{
                          // Let the List fill all vertical space
                          flexGrow: 1,
                          display: 'flex',
                          flexDirection: 'column'
                      }}
                >
                    {/* 1) Burger Button (at the top) */}
                    <ListItem disablePadding
                              sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  px: 2,
                                  py: 1
                              }}
                    >
                        <BurgerButton checked={open} onChange={onToggle} />
                    </ListItem>
                    <Divider />

                    {/* B.2) Main (top) navigation items */}
                    <ListItem disablePadding>
                        <ListItemButton component={Link} to="/">
                            <ListItemIcon sx={{ color: theme.palette.common.white }}>
                                <DashboardIcon />
                            </ListItemIcon>
                            {open && <ListItemText primary="Dashboard" />}
                        </ListItemButton>
                    </ListItem>
                    <Divider />

                    {/* C) “Flex grow” spacer to push the next items to the bottom */}
                    <Box sx={{ flexGrow: 1 }} />

                    <Divider />

                    {/* D) Bottom items */}
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