// ===== ..\client\src\main.jsx =====
import React from 'react'; // Import React
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx'; // Ensure correct extension
import { StatusProvider, ThemeProvider } from './features/system/index.jsx'; // Ensure correct extension
import { CsrfProvider } from './utils/csrfContext.jsx'; // Ensure correct extension
import { SnackbarProvider } from 'notistack';
import { IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

// Ref and action for closing snackbars programmatically
const notistackRef = React.createRef();
const onClickDismiss = key => () => {
    if (notistackRef.current) {
        notistackRef.current.closeSnackbar(key);
    }
}

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
    // Wrap with React.StrictMode for additional checks during development
    <React.StrictMode>
        <CsrfProvider>
            <StatusProvider>
                <ThemeProvider>
                    {/* SnackbarProvider now directly wraps App */}
                    <SnackbarProvider
                        ref={notistackRef}
                        maxSnack={5}
                        anchorOrigin={{
                            vertical: 'bottom',
                            horizontal: 'right',
                        }}
                        autoHideDuration={4000}
                        action={(key) => (
                            <IconButton size="small" aria-label="close" color="inherit" onClick={onClickDismiss(key)}>
                                <CloseIcon fontSize="small" />
                            </IconButton>
                        )}
                    >
                        <App />
                    </SnackbarProvider>
                </ThemeProvider>
            </StatusProvider>
        </CsrfProvider>
    </React.StrictMode>
);