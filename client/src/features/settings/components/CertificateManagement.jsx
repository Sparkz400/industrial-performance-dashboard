// ===== ..\client\src\features\settings\components\CertificateManagement.jsx =====
import React, { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Typography,
    Card,
    CardHeader,
    Avatar,
    Divider,
    Button,
    List,
    ListItem,
    ListItemText,
    ListItemSecondaryAction,
    IconButton,
    Badge,
    Chip,
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Alert, // Keep Alert for internal dialog/panel info
    LinearProgress,
    Paper,
    Tab,
    Tabs
} from '@mui/material';
import {
    Security as SecurityIcon,
    Check as CheckIcon,
    Error as ErrorIcon,
    Refresh as RefreshIcon,
    Done as DoneIcon,
    Key as KeyIcon,
    FileUpload as FileUploadIcon,
    Info as InfoIcon
} from '@mui/icons-material';
import { API_ENDPOINTS } from '../../../config/config.js';
import { useSnackbar } from 'notistack'; // Import useSnackbar

// TabPanel component
function TabPanel(props) {
    const { children, value, index, ...other } = props;

    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`cert-tabpanel-${index}`}
            aria-labelledby={`cert-tab-${index}`}
            {...other}
        >
            {value === index && (
                <Box sx={{ p: 3 }}>
                    {children}
                </Box>
            )}
        </div>
    );
}

/**
 * Certificate Management component for the Settings page
 */
const CertificateManagement = () => {
    // Tab state
    const [tabValue, setTabValue] = useState(0);

    // State for certificates
    const [trustedCerts, setTrustedCerts] = useState([]);
    const [rejectedCerts, setRejectedCerts] = useState([]);
    const [clientCert, setClientCert] = useState(null);

    // State for loading
    const [loading, setLoading] = useState(false);
    // Removed error/success state
    const { enqueueSnackbar } = useSnackbar(); // Use the hook

    // State for security options
    const [securityOptions, setSecurityOptions] = useState({
        securityModes: [],
        securityPolicies: [],
        current: { securityMode: 'None', securityPolicy: 'None' }
    });

    // Dialog states
    const [showSecurityDialog, setShowSecurityDialog] = useState(false);
    const [securityConfig, setSecurityConfig] = useState({
        securityMode: 'None',
        securityPolicy: 'None'
    });

    // File upload dialog state
    const [showUploadDialog, setShowUploadDialog] = useState(false);
    const [uploadState, setUploadState] = useState({
        name: '',
        file: null,
        error: null // Keep error state for dialog-specific feedback
    });

    // Certificate details dialog state
    const [showDetailsDialog, setShowDetailsDialog] = useState(false);
    const [selectedCert, setSelectedCert] = useState(null);

    // Function to load certificates
    const loadCertificates = useCallback(async () => {
        setLoading(true);
        // setError(null); // Removed

        try {
            // Fetch certificates in parallel
            const [trustedRes, rejectedRes, clientRes, securityRes] = await Promise.all([
                fetch(`${API_ENDPOINTS.status.replace('/status', '')}/certificates/trusted`),
                fetch(`${API_ENDPOINTS.status.replace('/status', '')}/certificates/rejected`),
                fetch(`${API_ENDPOINTS.status.replace('/status', '')}/certificates/client`),
                fetch(`${API_ENDPOINTS.status.replace('/status', '')}/certificates/security-options`)
            ]);

            // Process each response
            if (trustedRes.ok) {
                const trusted = await trustedRes.json();
                setTrustedCerts(trusted);
            }

            if (rejectedRes.ok) {
                const rejected = await rejectedRes.json();
                setRejectedCerts(rejected);
            }

            if (clientRes.ok) {
                const client = await clientRes.json();
                setClientCert(client);
            }

            if (securityRes.ok) {
                const options = await securityRes.json();
                setSecurityOptions(options);
                // Ensure current options exist before setting config
                const currentMode = options.current?.securityMode || 'None';
                const currentPolicy = options.current?.securityPolicy || 'None';
                setSecurityConfig({
                    securityMode: currentMode,
                    securityPolicy: currentPolicy
                });
            } else {
                enqueueSnackbar('Failed to load security options', { variant: 'warning' });
            }
        } catch (err) {
            console.error('Error loading certificates:', err);
            // Replace setError
            enqueueSnackbar(`Failed to load certificates: ${err.message || 'Unknown error'}`, { variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [enqueueSnackbar]); // Add enqueueSnackbar dependency

    // Load certificates on mount
    useEffect(() => {
        void loadCertificates();
    }, [loadCertificates]);

    // Function to handle tab change
    const handleTabChange = (event, newValue) => {
        setTabValue(newValue);
    };

    // Function to regenerate client certificate
    const handleRegenerateClientCert = async () => {
        if (!window.confirm('Are you sure you want to regenerate the client certificate? This may impact existing connections.')) {
            return;
        }

        setLoading(true);
        // setError(null); // Removed

        try {
            const response = await fetch(`${API_ENDPOINTS.status.replace('/status', '')}/certificates/regenerate`, {
                method: 'POST'
            });

            if (response.ok) {
                // Replace setSuccess
                enqueueSnackbar('Client certificate regenerated successfully', { variant: 'success' });
                await loadCertificates(); // Reload certificates
            } else {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to regenerate certificate');
            }
        } catch (err) {
            console.error('Error regenerating certificate:', err);
            // Replace setError
            enqueueSnackbar(`Failed to regenerate certificate: ${err.message || 'Unknown error'}`, { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    // Function to accept rejected certificate
    const handleAcceptRejected = async (filename) => {
        setLoading(true);
        // setError(null); // Removed

        try {
            const response = await fetch(`${API_ENDPOINTS.status.replace('/status', '')}/certificates/accept-rejected/${filename}`, {
                method: 'POST'
            });

            if (response.ok) {
                // Replace setSuccess
                enqueueSnackbar(`Certificate ${filename} accepted successfully`, { variant: 'success' });
                await loadCertificates(); // Reload certificates
            } else {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to accept certificate');
            }
        } catch (err) {
            console.error('Error accepting certificate:', err);
            // Replace setError
            enqueueSnackbar(`Failed to accept certificate: ${err.message || 'Unknown error'}`, { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    // Function to upload a certificate
    const handleUploadCertificate = async () => {
        if (!uploadState.file || !uploadState.name) {
            setUploadState({ ...uploadState, error: 'Both name and file are required' });
            // Optionally add snackbar here too
            enqueueSnackbar('Certificate name and file are required', { variant: 'warning' });
            return;
        }

        setLoading(true);
        // setError(null); // Removed

        try {
            // Read the file as base64
            const reader = new FileReader();
            const result = await new Promise((resolve, reject) => {
                reader.onload = () => resolve(reader.result);
                reader.onerror = (err) => reject(err);
                reader.readAsDataURL(uploadState.file);
            });

            if (typeof result !== 'string') {
                throw new Error('Failed to read file content');
            }

            // Extract the base64 part only
            const base64Certificate = result.split(',')[1];
            if (!base64Certificate) {
                throw new Error('Failed to extract base64 content from file');
            }

            // Send to server
            const response = await fetch(`${API_ENDPOINTS.status.replace('/status', '')}/certificates/trust`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ certificate: base64Certificate, name: uploadState.name })
            });

            if (response.ok) {
                // Replace setSuccess
                enqueueSnackbar('Certificate uploaded and trusted successfully', { variant: 'success' });
                setShowUploadDialog(false);
                setUploadState({ name: '', file: null, error: null });
                await loadCertificates(); // Reload certificates
            } else {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to upload certificate');
            }
        } catch (err) {
            console.error('Error uploading certificate:', err);
            setUploadState({ ...uploadState, error: err.message || 'Failed to upload certificate' });
            // Add snackbar for the main error
            enqueueSnackbar(`Failed to upload certificate: ${err.message || 'Unknown error'}`, { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    // Function to update security configuration
    const handleUpdateSecurity = async () => {
        setLoading(true);
        // setError(null); // Removed

        try {
            const response = await fetch(`${API_ENDPOINTS.opcua.connect}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ip: securityOptions.current?.ip || 'localhost', // Use optional chaining
                    port: securityOptions.current?.port || 4840,
                    resourcePath: securityOptions.current?.resourcePath || '/UA/MyLittleServer',
                    securityMode: securityConfig.securityMode,
                    securityPolicy: securityConfig.securityPolicy
                })
            });

            if (response.ok) {
                // Replace setSuccess
                enqueueSnackbar('Security configuration updated successfully', { variant: 'success' });
                setShowSecurityDialog(false);
                await loadCertificates(); // Reload certificates and security options
            } else {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to update security configuration');
            }
        } catch (err) {
            console.error('Error updating security configuration:', err);
            // Replace setError
            enqueueSnackbar(`Failed to update security configuration: ${err.message || 'Unknown error'}`, { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    // Function to show certificate details
    const handleViewCertDetails = (cert) => {
        setSelectedCert(cert);
        setShowDetailsDialog(true);
    };

    // Helper function to parse certificate info (simplified)
    const parseCertificateInfo = (certPem) => {
        // ... (remains the same) ...
        return {}; // Placeholder
    };

    // Removed the useEffect for clearing success message

    return (
        <Card>
            <CardHeader
                title="Certificate Management"
                avatar={<Avatar><SecurityIcon /></Avatar>}
                action={
                    <Button
                        startIcon={<RefreshIcon />}
                        onClick={loadCertificates}
                        disabled={loading}
                    >
                        Refresh
                    </Button>
                }
            />
            <Divider />

            {/* Loading indicator */}
            {loading && <LinearProgress />}
            {/* Removed internal Alert components for error/success */}

            {/* Security configuration summary */}
            <Box sx={{ px: 3, pt: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6">OPC UA Security Configuration</Typography>
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={() => setShowSecurityDialog(true)}
                        startIcon={<SecurityIcon />}
                        disabled={loading} // Disable if loading certs
                    >
                        Configure Security
                    </Button>
                </Box>
                <Box sx={{ mt: 2, mb: 2 }}>
                    <Typography variant="body1" component="div"> {/* Use div for better layout */}
                        Current security settings:
                        <Chip
                            label={`Mode: ${securityOptions.current?.securityMode || 'None'}`}
                            color={securityOptions.current?.securityMode === 'None' ? 'default' : 'primary'}
                            sx={{ ml: 1, mr: 1 }}
                        />
                        <Chip
                            label={`Policy: ${securityOptions.current?.securityPolicy || 'None'}`}
                            color={securityOptions.current?.securityPolicy === 'None' ? 'default' : 'primary'}
                        />
                    </Typography>
                </Box>
            </Box>

            <Divider />

            {/* Certificate tabs */}
            <Box sx={{ width: '100%' }}>
                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs
                        value={tabValue}
                        onChange={handleTabChange}
                        aria-label="certificate tabs"
                    >
                        <Tab
                            label={ <Box sx={{ display: 'flex', alignItems: 'center' }}> Client Certificate <KeyIcon sx={{ ml: 1 }} /> </Box> }
                            id="cert-tab-0"
                        />
                        <Tab
                            label={ <Box sx={{ display: 'flex', alignItems: 'center' }}> Trusted Certificates <Badge badgeContent={trustedCerts.length} color="primary" sx={{ ml: 1 }}> <CheckIcon /> </Badge> </Box> }
                            id="cert-tab-1"
                        />
                        <Tab
                            label={ <Box sx={{ display: 'flex', alignItems: 'center' }}> Rejected Certificates <Badge badgeContent={rejectedCerts.length} color="error" sx={{ ml: 1 }}> <ErrorIcon /> </Badge> </Box> }
                            id="cert-tab-2"
                        />
                    </Tabs>
                </Box>

                {/* Client Certificate Tab */}
                <TabPanel value={tabValue} index={0}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6">Client Certificate</Typography>
                        <Button
                            variant="contained"
                            color="warning"
                            onClick={handleRegenerateClientCert}
                            startIcon={<RefreshIcon />}
                            disabled={loading}
                        >
                            Regenerate Certificate
                        </Button>
                    </Box>
                    {clientCert ? (
                        <Paper sx={{ p: 3 }}>
                            <Typography variant="subtitle1" gutterBottom>Certificate Details</Typography>
                            <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap', /* ... other styles */ }}>
                                {clientCert.certificate}
                            </Typography>
                            <Box sx={{ mt: 2 }}>
                                <Typography variant="body2"> <strong>Certificate Path:</strong> {clientCert.certificatePath} </Typography>
                                <Typography variant="body2"> <strong>Private Key Path:</strong> {clientCert.privateKeyPath} </Typography>
                            </Box>
                        </Paper>
                    ) : (
                        <Alert severity="info"> No client certificate found. Generate one to enable secure connections. </Alert>
                    )}
                </TabPanel>

                {/* Trusted Certificates Tab */}
                <TabPanel value={tabValue} index={1}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6">Trusted Certificates</Typography>
                        <Button variant="contained" color="primary" startIcon={<FileUploadIcon />} onClick={() => setShowUploadDialog(true)} disabled={loading} >
                            Upload Certificate
                        </Button>
                    </Box>
                    {trustedCerts.length === 0 ? (
                        <Alert severity="info"> No trusted certificates found. </Alert>
                    ) : (
                        <List sx={{ width: '100%', bgcolor: 'background.paper' }}>
                            {trustedCerts.map((cert) => (
                                <ListItem key={cert.name} divider>
                                    <ListItemText primary={cert.name} secondary={`Path: ${cert.path}`} />
                                    <ListItemSecondaryAction>
                                        <IconButton edge="end" aria-label="view details" onClick={() => handleViewCertDetails(cert)} > <InfoIcon /> </IconButton>
                                    </ListItemSecondaryAction>
                                </ListItem>
                            ))}
                        </List>
                    )}
                </TabPanel>

                {/* Rejected Certificates Tab */}
                <TabPanel value={tabValue} index={2}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6">Rejected Certificates</Typography>
                    </Box>
                    {rejectedCerts.length === 0 ? (
                        <Alert severity="info"> No rejected certificates found. </Alert>
                    ) : (
                        <List sx={{ width: '100%', bgcolor: 'background.paper' }}>
                            {rejectedCerts.map((cert) => (
                                <ListItem key={cert.name} divider>
                                    <ListItemText primary={cert.name} secondary={`Path: ${cert.path}`} />
                                    <ListItemSecondaryAction>
                                        <Tooltip title="Accept Certificate">
                                            <span> {/* Span needed for tooltip on disabled button */}
                                                <IconButton edge="end" aria-label="accept" color="primary" onClick={() => handleAcceptRejected(cert.name)} disabled={loading} > <DoneIcon /> </IconButton>
                                            </span>
                                        </Tooltip>
                                        <IconButton edge="end" aria-label="view details" onClick={() => handleViewCertDetails(cert)} > <InfoIcon /> </IconButton>
                                    </ListItemSecondaryAction>
                                </ListItem>
                            ))}
                        </List>
                    )}
                </TabPanel>
            </Box>

            {/* Security Configuration Dialog */}
            <Dialog open={showSecurityDialog} onClose={() => setShowSecurityDialog(false)} maxWidth="sm" fullWidth >
                <DialogTitle>Configure OPC UA Security</DialogTitle>
                <DialogContent>
                    <Box sx={{ mt: 2 }}>
                        <Alert severity="info" sx={{ mb: 2 }}> Changing security settings will disconnect and reconnect to the OPC UA server. </Alert>
                        <FormControl fullWidth sx={{ mb: 2 }}>
                            <InputLabel id="security-mode-label">Security Mode</InputLabel>
                            <Select labelId="security-mode-label" value={securityConfig.securityMode} label="Security Mode" onChange={(e) => setSecurityConfig({ ...securityConfig, securityMode: e.target.value })} >
                                {securityOptions.securityModes.map((mode) => ( <MenuItem key={mode} value={mode}> {mode} </MenuItem> ))}
                            </Select>
                        </FormControl>
                        <FormControl fullWidth>
                            <InputLabel id="security-policy-label">Security Policy</InputLabel>
                            <Select labelId="security-policy-label" value={securityConfig.securityPolicy} label="Security Policy" onChange={(e) => setSecurityConfig({ ...securityConfig, securityPolicy: e.target.value })} >
                                {securityOptions.securityPolicies.map((policy) => ( <MenuItem key={policy} value={policy}> {policy} </MenuItem> ))}
                            </Select>
                        </FormControl>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setShowSecurityDialog(false)}>Cancel</Button>
                    <Button onClick={handleUpdateSecurity} variant="contained" color="primary" disabled={loading} > Save Changes </Button>
                </DialogActions>
            </Dialog>

            {/* Upload Certificate Dialog */}
            <Dialog open={showUploadDialog} onClose={() => setShowUploadDialog(false)} maxWidth="sm" fullWidth >
                <DialogTitle>Upload Certificate</DialogTitle>
                <DialogContent>
                    {/* Keep internal Alert for dialog-specific errors */}
                    {uploadState.error && ( <Alert severity="error" sx={{ mt: 2, mb: 2 }}> {uploadState.error} </Alert> )}
                    <TextField autoFocus margin="dense" id="cert-name" label="Certificate Name" fullWidth value={uploadState.name} onChange={(e) => setUploadState({ ...uploadState, name: e.target.value, error: null })} sx={{ mb: 2 }} />
                    <Box sx={{ border: '1px dashed', borderColor: 'divider', borderRadius: 1, p: 2, textAlign: 'center' }}>
                        <input type="file" accept=".pem,.crt,.cer,.der" id="cert-file-upload" style={{ display: 'none' }} onChange={(e) => { if (e.target.files && e.target.files[0]) { setUploadState({ ...uploadState, file: e.target.files[0], error: null }); } }} />
                        <label htmlFor="cert-file-upload">
                            <Button variant="outlined" component="span" startIcon={<FileUploadIcon />} > Select Certificate File </Button>
                        </label>
                        {uploadState.file && ( <Typography variant="body2" sx={{ mt: 2 }}> Selected file: {uploadState.file.name} </Typography> )}
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => { setShowUploadDialog(false); setUploadState({ name: '', file: null, error: null }); }}> Cancel </Button>
                    <Button onClick={handleUploadCertificate} variant="contained" color="primary" disabled={!uploadState.file || !uploadState.name || loading} > Upload </Button>
                </DialogActions>
            </Dialog>

            {/* Certificate Details Dialog */}
            <Dialog open={showDetailsDialog} onClose={() => setShowDetailsDialog(false)} maxWidth="md" fullWidth >
                <DialogTitle>Certificate Details</DialogTitle>
                <DialogContent>
                    {selectedCert && (
                        <Box>
                            <Typography variant="subtitle1" gutterBottom> {selectedCert.name} </Typography>
                            <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap', /* ... other styles */ }}>
                                { /* Decode base64 content for display */ }
                                {(() => {
                                    try {
                                        return atob(selectedCert.content);
                                    } catch (e) {
                                        console.error("Failed to decode base64 certificate content", e);
                                        return "Error decoding certificate content.";
                                    }
                                })()}
                            </Typography>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setShowDetailsDialog(false)}>Close</Button>
                </DialogActions>
            </Dialog>
        </Card>
    );
};

export default CertificateManagement;