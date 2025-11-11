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
    Tabs,
    CircularProgress // Import CircularProgress
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
import { API_ENDPOINTS } from '../../../config/config';
import api from '../../../utils/api'
import { useSnackbar } from 'notistack';
import { ButtonLoader } from '../../../shared/components/loading/index.js';

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

    // State for loading specific actions
    const [loadingCerts, setLoadingCerts] = useState(false);
    const [loadingRegenerate, setLoadingRegenerate] = useState(false);
    const [loadingAccept, setLoadingAccept] = useState(null); // Store filename being accepted
    const [loadingUpload, setLoadingUpload] = useState(false);
    const [loadingSecurityUpdate, setLoadingSecurityUpdate] = useState(false);
    // Removed error/success state
    const { enqueueSnackbar } = useSnackbar();

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
        setLoadingCerts(true);
        try {
            // Use api.get for automatic handling (including potential CSRF for GET if ever needed)
            const [trusted, rejected, client, options] = await Promise.all([
                api.get(API_ENDPOINTS.certificates.trusted),
                api.get(API_ENDPOINTS.certificates.rejected),
                api.get(API_ENDPOINTS.certificates.client),
                api.get(API_ENDPOINTS.certificates.securityOptions)
            ]);

            setTrustedCerts(trusted || []); // Ensure arrays even if response is empty/null
            setRejectedCerts(rejected || []);
            setClientCert(client || null);

            if (options) {
                setSecurityOptions(options);
                const currentMode = options.current?.securityMode || 'None';
                const currentPolicy = options.current?.securityPolicy || 'None';
                setSecurityConfig({
                    securityMode: currentMode,
                    securityPolicy: currentPolicy
                });
            } else {
                enqueueSnackbar('Failed to load security options', { variant: 'warning' });
                setSecurityOptions({ securityModes: [], securityPolicies: [], current: { securityMode: 'None', securityPolicy: 'None' } }); // Set defaults on failure
            }

        } catch (err) { // Errors from api.get/handleResponse are caught here
            console.error('Error loading certificates:', err);
            enqueueSnackbar(`Failed to load certificates: ${err.message || 'Unknown error'}`, { variant: 'error' });
            // Optionally reset state on error
            setTrustedCerts([]);
            setRejectedCerts([]);
            setClientCert(null);
            setSecurityOptions({ securityModes: [], securityPolicies: [], current: { securityMode: 'None', securityPolicy: 'None' } });
        } finally {
            setLoadingCerts(false);
        }
    }, [enqueueSnackbar]);

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
        setLoadingRegenerate(true);
        try {
            // Use api.post - CSRF token will be added automatically
            await api.post(API_ENDPOINTS.certificates.regenerate, {}); // Send empty body if needed
            enqueueSnackbar('Client certificate regenerated successfully', { variant: 'success' });
            await loadCertificates(); // Reload certificates
        } catch (err) {
            console.error('Error regenerating certificate:', err);
            enqueueSnackbar(`Failed to regenerate certificate: ${err.message || 'Unknown error'}`, { variant: 'error' });
        } finally {
            setLoadingRegenerate(false);
        }
    };

    // Function to accept rejected certificate
    const handleAcceptRejected = async (filename) => {
        setLoadingAccept(filename);
        try {
            // Use api.post - CSRF token will be added automatically
            await api.post(API_ENDPOINTS.certificates.acceptRejected(filename), {}); // Use the dynamic endpoint function
            enqueueSnackbar(`Certificate ${filename} accepted successfully`, { variant: 'success' });
            await loadCertificates(); // Reload certificates
        } catch (err) {
            console.error('Error accepting certificate:', err);
            enqueueSnackbar(`Failed to accept certificate: ${err.message || 'Unknown error'}`, { variant: 'error' });
        } finally {
            setLoadingAccept(null);
        }
    };

    // Function to upload a certificate
    const handleUploadCertificate = async () => {
        if (!uploadState.file || !uploadState.name) {
            setUploadState({ ...uploadState, error: 'Both name and file are required' });
            enqueueSnackbar('Certificate name and file are required', { variant: 'warning' });
            return;
        }
        setLoadingUpload(true);
        try {
            const reader = new FileReader();
            const result = await new Promise((resolve, reject) => {
                reader.onload = () => resolve(reader.result);
                reader.onerror = (err) => reject(err);
                reader.readAsDataURL(uploadState.file);
            });

            if (typeof result !== 'string') throw new Error('Failed to read file content');
            const base64Certificate = result.split(',')[1];
            if (!base64Certificate) throw new Error('Failed to extract base64 content from file');

            // Use api.post
            await api.post(API_ENDPOINTS.certificates.trust, {
                certificate: base64Certificate,
                name: uploadState.name
            });

            enqueueSnackbar('Certificate uploaded and trusted successfully', { variant: 'success' });
            setShowUploadDialog(false);
            setUploadState({ name: '', file: null, error: null });
            await loadCertificates(); // Reload certificates

        } catch (err) {
            console.error('Error uploading certificate:', err);
            setUploadState({ ...uploadState, error: err.message || 'Failed to upload certificate' });
            enqueueSnackbar(`Failed to upload certificate: ${err.message || 'Unknown error'}`, { variant: 'error' });
        } finally {
            setLoadingUpload(false);
        }
    };


    // Function to update security configuration
    const handleUpdateSecurity = async () => {
        setLoadingSecurityUpdate(true);
        try {
            // Use api.post
            await api.post(API_ENDPOINTS.opcua.connect, { // Still using opcua connect endpoint
                ip: securityOptions.current?.ip || 'localhost',
                port: securityOptions.current?.port || 4840,
                resourcePath: securityOptions.current?.resourcePath || '/UA/MyLittleServer',
                securityMode: securityConfig.securityMode,
                securityPolicy: securityConfig.securityPolicy
            });

            enqueueSnackbar('Security configuration update initiated successfully', { variant: 'success' });
            setShowSecurityDialog(false);
            await loadCertificates(); // Reload security options
        } catch (err) {
            console.error('Error updating security configuration:', err);
            enqueueSnackbar(`Failed to update security configuration: ${err.message || 'Unknown error'}`, { variant: 'error' });
        } finally {
            setLoadingSecurityUpdate(false);
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

    const decodeCertContent = (base64Content) => {
        if (!base64Content) return "No content available.";
        try {
            // Browsers have built-in atob for Base64 decoding
            return atob(base64Content);
        } catch (e) {
            console.error("Failed to decode base64 certificate content", e);
            // Check if it's already decoded (less likely but possible)
            if (base64Content.includes("-----BEGIN CERTIFICATE-----")) {
                return base64Content;
            }
            return "Error decoding certificate content.";
        }
    };
    return (
        <Card>
            <CardHeader
                title="Certificate Management"
                avatar={<Avatar><SecurityIcon /></Avatar>}
                action={
                    <Button
                        startIcon={<RefreshIcon />}
                        onClick={loadCertificates}
                        disabled={loadingCerts}
                    >
                        Refresh
                    </Button>
                }
            />
            <Divider />

            {/* Loading indicator */}
            {loadingCerts && <LinearProgress />}
            {/* Removed internal Alert components for error/success */}

            {/* Security configuration summary */}
            <Box sx={{ px: 3, pt: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6">OPC UA Security Configuration</Typography>
                    <Button
                        variant="outlined"
                        color="primary"
                        onClick={() => setShowSecurityDialog(true)}
                        startIcon={<SecurityIcon />}
                        disabled={loadingCerts || loadingSecurityUpdate} // Disable while loading/updating
                    >
                        Configure Security
                    </Button>
                </Box>
                <Box sx={{ mt: 2, mb: 2 }}>
                    <Typography variant="body1" component="div">
                        Current security settings:
                        <Chip
                            label={`Mode: ${securityOptions.current?.securityMode || 'N/A'}`} // Use N/A if loading/error
                            color={securityOptions.current?.securityMode === 'None' ? 'default' : 'primary'}
                            sx={{ ml: 1, mr: 1 }}
                        />
                        <Chip
                            label={`Policy: ${securityOptions.current?.securityPolicy || 'N/A'}`} // Use N/A if loading/error
                            color={securityOptions.current?.securityPolicy === 'None' ? 'default' : 'primary'}
                        />
                    </Typography>
                </Box>
            </Box>


            <Divider />

            {/* Certificate tabs */}
            <Box sx={{ width: '100%' }}>
                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs value={tabValue} onChange={handleTabChange} aria-label="certificate tabs">
                        {/* ... Tab definitions ... */}
                    </Tabs>
                </Box>

                {/* Client Certificate Tab */}
                <TabPanel value={tabValue} index={0}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6">Client Certificate</Typography>
                        <ButtonLoader
                            variant="contained"
                            color="warning" // Changed color to warning as it's a potentially disruptive action
                            onClick={handleRegenerateClientCert}
                            startIcon={<RefreshIcon />}
                            loading={loadingRegenerate}
                            disabled={loadingCerts} // Also disable if initial load is happening
                        >
                            Regenerate Certificate
                        </ButtonLoader>
                    </Box>
                    {clientCert ? (
                        <Paper variant="outlined" sx={{ p: 2, maxHeight: '300px', overflow: 'auto' }}>
                            <Typography variant="subtitle2" gutterBottom>Certificate Details</Typography>
                            <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                {clientCert.certificate}
                            </Typography>
                            <Divider sx={{ my: 1 }} />
                            <Typography variant="caption" display="block">Certificate Path: {clientCert.certificatePath}</Typography>
                            <Typography variant="caption" display="block">Private Key Path: {clientCert.privateKeyPath}</Typography>
                        </Paper>
                    ) : !loadingCerts && ( // Only show if not loading
                        <Alert severity="info">No client certificate found or failed to load.</Alert>
                    )}
                </TabPanel>

                {/* Trusted Certificates Tab */}
                <TabPanel value={tabValue} index={1}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6">Trusted Certificates ({trustedCerts.length})</Typography>
                        <ButtonLoader
                            variant="contained"
                            color="primary"
                            startIcon={<FileUploadIcon />}
                            onClick={() => setShowUploadDialog(true)}
                            loading={loadingUpload}
                            disabled={loadingCerts}
                        >
                            Upload Certificate
                        </ButtonLoader>
                    </Box>
                    {trustedCerts.length === 0 && !loadingCerts ? (
                        <Alert severity="info">No trusted certificates found.</Alert>
                    ) : (
                        <List sx={{ width: '100%', bgcolor: 'background.paper', maxHeight: '400px', overflow: 'auto' }}>
                            {trustedCerts.map((cert) => (
                                <ListItem key={cert.name} divider>
                                    <ListItemText primary={cert.name} secondary={`Path: ${cert.path}`} />
                                    <ListItemSecondaryAction>
                                        <Tooltip title="View Details">
                                            <IconButton edge="end" aria-label="view details" onClick={() => handleViewCertDetails(cert)}>
                                                <InfoIcon />
                                            </IconButton>
                                        </Tooltip>
                                        {/* Optional: Add Delete Trusted Cert functionality here */}
                                    </ListItemSecondaryAction>
                                </ListItem>
                            ))}
                        </List>
                    )}
                </TabPanel>

                {/* Rejected Certificates Tab */}
                <TabPanel value={tabValue} index={2}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6">Rejected Certificates ({rejectedCerts.length})</Typography>
                    </Box>
                    {rejectedCerts.length === 0 && !loadingCerts ? (
                        <Alert severity="info">No rejected certificates found.</Alert>
                    ) : (
                        <List sx={{ width: '100%', bgcolor: 'background.paper', maxHeight: '400px', overflow: 'auto' }}>
                            {rejectedCerts.map((cert) => (
                                <ListItem key={cert.name} divider>
                                    <ListItemText primary={cert.name} secondary={`Path: ${cert.path}`} />
                                    <ListItemSecondaryAction>
                                        <Tooltip title="Accept Certificate">
                                            <span> {/* Span needed for tooltip on disabled button */}
                                                <IconButton
                                                    edge="end"
                                                    aria-label="accept"
                                                    color="success" // Use success color for accept icon
                                                    onClick={() => handleAcceptRejected(cert.name)}
                                                    disabled={!!loadingAccept || loadingCerts} // Disable if any accept is in progress or initial load
                                                >
                                                    {loadingAccept === cert.name ? <CircularProgress size={20} /> : <DoneIcon />}
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                        <Tooltip title="View Details">
                                            <IconButton edge="end" aria-label="view details" onClick={() => handleViewCertDetails(cert)} sx={{ ml: 1 }}>
                                                <InfoIcon />
                                            </IconButton>
                                        </Tooltip>
                                        {/* Optional: Add Delete Rejected Cert functionality here */}
                                    </ListItemSecondaryAction>
                                </ListItem>
                            ))}
                        </List>
                    )}
                </TabPanel>
            </Box>

            {/* Dialogs (Security, Upload, Details) - Ensure they use correct loading states */}
            {/* Security Configuration Dialog */}
            <Dialog open={showSecurityDialog} onClose={() => setShowSecurityDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Configure OPC UA Security</DialogTitle>
                <DialogContent>
                    <Box sx={{ mt: 2 }}>
                        <Alert severity="warning" sx={{ mb: 2 }}>
                            Changing security settings requires a server reconnect attempt. Ensure the server supports the selected mode/policy.
                        </Alert>
                        <FormControl fullWidth sx={{ mb: 2 }}>
                            <InputLabel id="security-mode-label">Security Mode</InputLabel>
                            <Select
                                labelId="security-mode-label"
                                value={securityConfig.securityMode}
                                label="Security Mode"
                                onChange={(e) => setSecurityConfig({ ...securityConfig, securityMode: e.target.value })}
                            >
                                {(securityOptions.securityModes || []).map((mode) => (
                                    <MenuItem key={mode} value={mode}>{mode}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <FormControl fullWidth>
                            <InputLabel id="security-policy-label">Security Policy</InputLabel>
                            <Select
                                labelId="security-policy-label"
                                value={securityConfig.securityPolicy}
                                label="Security Policy"
                                onChange={(e) => setSecurityConfig({ ...securityConfig, securityPolicy: e.target.value })}
                                disabled={securityConfig.securityMode === 'None'} // Disable policy if mode is None
                            >
                                {(securityOptions.securityPolicies || []).map((policy) => (
                                    <MenuItem key={policy} value={policy}>{policy}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setShowSecurityDialog(false)} disabled={loadingSecurityUpdate}>Cancel</Button>
                    <ButtonLoader
                        onClick={handleUpdateSecurity}
                        variant="contained"
                        color="primary"
                        loading={loadingSecurityUpdate}
                    >
                        Apply & Reconnect
                    </ButtonLoader>
                </DialogActions>
            </Dialog>

            {/* Upload Certificate Dialog */}
            <Dialog open={showUploadDialog} onClose={() => setShowUploadDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Upload Trusted Certificate</DialogTitle>
                <DialogContent>
                    {uploadState.error && ( <Alert severity="error" sx={{ mt: 2, mb: 2 }}>{uploadState.error}</Alert> )}
                    <TextField autoFocus margin="dense" id="cert-name" label="Certificate Name (e.g., ServerName_Cert)" fullWidth value={uploadState.name} onChange={(e) => setUploadState({ ...uploadState, name: e.target.value, error: null })} sx={{ mb: 2 }} />
                    <Box sx={{ border: '1px dashed', borderColor: 'divider', borderRadius: 1, p: 2, textAlign: 'center' }}>
                        <input type="file" accept=".pem,.crt,.cer,.der" id="cert-file-upload" style={{ display: 'none' }} onChange={(e) => { if (e.target.files && e.target.files[0]) { setUploadState({ ...uploadState, file: e.target.files[0], error: null }); } }} />
                        <label htmlFor="cert-file-upload">
                            <Button variant="outlined" component="span" startIcon={<FileUploadIcon />}>Select Certificate File (.pem, .crt, .der)</Button>
                        </label>
                        {uploadState.file && ( <Typography variant="body2" sx={{ mt: 2 }}>Selected file: {uploadState.file.name}</Typography> )}
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => { setShowUploadDialog(false); setUploadState({ name: '', file: null, error: null }); }} disabled={loadingUpload}>Cancel</Button>
                    <ButtonLoader
                        onClick={handleUploadCertificate}
                        variant="contained"
                        color="primary"
                        disabled={!uploadState.file || !uploadState.name.trim()} // Ensure name is not empty
                        loading={loadingUpload}
                    >
                        Upload & Trust
                    </ButtonLoader>
                </DialogActions>
            </Dialog>

            {/* Certificate Details Dialog */}
            <Dialog open={showDetailsDialog} onClose={() => setShowDetailsDialog(false)} maxWidth="md" fullWidth>
                <DialogTitle>Certificate Details</DialogTitle>
                <DialogContent>
                    {selectedCert && (
                        <Box>
                            <Typography variant="subtitle1" gutterBottom>{selectedCert.name}</Typography>
                            <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap', maxHeight: '400px', overflow: 'auto', bgcolor: 'grey.100', p: 1, borderRadius: 1 }}>
                                {decodeCertContent(selectedCert.content)}
                            </Typography>
                            <Typography variant="caption" display="block" sx={{mt: 1}}>Path: {selectedCert.path}</Typography>
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