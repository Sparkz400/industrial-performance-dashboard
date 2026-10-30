import React, { useState } from 'react';
import {
  Typography,
  Box,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Tab,
  Tabs,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutlined';
import DashboardIcon from '@mui/icons-material/Dashboard';
import WidgetsIcon from '@mui/icons-material/Widgets';
import SettingsIcon from '@mui/icons-material/Settings';
import StorageIcon from '@mui/icons-material/Storage';
import DnsIcon from '@mui/icons-material/Dns';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Grid from '@mui/material/Grid';

// TabPanel props
interface TabPanelProps {
  children?: React.ReactNode;
  value: number;
  index: number;
  sx?: SxProps<Theme>;
  [key: string]: unknown;
}

// TabPanel component for the tabs
/**
 *
 * @param props
 */
function TabPanel(props: TabPanelProps): React.JSX.Element {
  const { children, value, index, sx = {}, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`help-tabpanel-${index}`}
      aria-labelledby={`help-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3, ...sx }}>{children}</Box>}
    </div>
  );
}

const HelpPage: React.FC = () => {
  const [tabValue, setTabValue] = useState<number>(0);

  // Handle tab change
  const handleTabChange = (_event: React.SyntheticEvent, newValue: number): void => {
    setTabValue(newValue);
  };

  return (
    <Box
      sx={{
        height: '100%',
        p: 4,
        overflow: 'auto',
      }}
    >
      <Paper
        sx={{
          p: 3,
          borderRadius: 2,
          boxShadow: 3,
          height: 'calc(100vh - 80px)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Grid
          container
          spacing={2}
          sx={{
            alignItems: 'center',
          }}
        >
          <Grid>
            <HelpOutlineIcon sx={{ fontSize: 50, color: '#b3b3b3' }} />
          </Grid>
          <Grid>
            <Typography variant="h4" gutterBottom>
              Application Help & Documentation
            </Typography>
            <Typography variant="body1" color="textSecondary">
              This guide provides information on how to use the dashboard application and its
              features.
            </Typography>
          </Grid>
        </Grid>

        <Box sx={{ borderBottom: 1, borderColor: 'divider', mt: 4 }}>
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            aria-label="help content tabs"
            variant="scrollable"
            scrollButtons="auto"
          >
            <Tab label="Getting Started" id="help-tab-0" />
            <Tab label="Dashboard" id="help-tab-1" />
            <Tab label="Widgets" id="help-tab-2" />
            <Tab label="Settings" id="help-tab-3" />
            <Tab label="Troubleshooting" id="help-tab-4" />
          </Tabs>
        </Box>

        {/* Getting Started Tab */}
        <TabPanel
          value={tabValue}
          index={0}
          sx={{ overflow: 'auto', maxHeight: 'calc(100vh - 220px)' }}
        >
          <Typography variant="h5" gutterBottom>
            Getting Started
          </Typography>

          <Typography variant="h6" sx={{ mt: 3 }}>
            Application Overview
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            This application is a dashboard system designed to monitor and visualize data from OPC
            UA servers. It provides real-time monitoring, data visualization, and system
            configuration tools.
          </Typography>

          <Typography variant="h6" sx={{ mt: 3 }}>
            Navigation
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            The application has a sidebar menu on the left with the following main sections:
          </Typography>

          <List sx={{ mb: 3 }}>
            <ListItem>
              <ListItemIcon>
                <DashboardIcon />
              </ListItemIcon>
              <ListItemText
                primary="Dashboard"
                secondary="Create and customize dashboards with various widgets"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <SettingsIcon />
              </ListItemIcon>
              <ListItemText
                primary="Settings"
                secondary="Configure connections, appearance, and other system settings"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <HelpOutlineIcon />
              </ListItemIcon>
              <ListItemText
                primary="Help"
                secondary="Access application documentation and guides (you are here)"
              />
            </ListItem>
          </List>

          <Typography variant="h6" sx={{ mt: 3 }}>
            Key Features
          </Typography>
          <List>
            <ListItem>
              <ListItemIcon>
                <KeyboardArrowRightIcon />
              </ListItemIcon>
              <ListItemText
                primary="Multiple Dashboards"
                secondary="Create and manage multiple dashboards for different monitoring needs"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <KeyboardArrowRightIcon />
              </ListItemIcon>
              <ListItemText
                primary="Customizable Widgets"
                secondary="Add, resize, and configure various widgets to visualize your data"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <KeyboardArrowRightIcon />
              </ListItemIcon>
              <ListItemText
                primary="OPC UA Integration"
                secondary="Connect to OPC UA servers to retrieve real-time data"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <KeyboardArrowRightIcon />
              </ListItemIcon>
              <ListItemText
                primary="Data Visualization"
                secondary="View your data in charts, graphs, and other visual formats"
              />
            </ListItem>
          </List>
        </TabPanel>

        {/* Dashboard Tab */}
        <TabPanel
          value={tabValue}
          index={1}
          sx={{ overflow: 'auto', maxHeight: 'calc(100vh - 220px)' }}
        >
          <Typography variant="h5" gutterBottom>
            Dashboard Usage
          </Typography>

          <Typography variant="h6" sx={{ mt: 3 }}>
            Creating a New Dashboard
          </Typography>
          <Typography variant="body1">To create a new dashboard:</Typography>
          <List sx={{ mb: 3 }}>
            <ListItem>
              <ListItemIcon>
                <KeyboardArrowRightIcon />
              </ListItemIcon>
              <ListItemText primary="Click the 'New' button in the top dashboard toolbar" />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <KeyboardArrowRightIcon />
              </ListItemIcon>
              <ListItemText primary="A new dashboard will be created with a default name" />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <KeyboardArrowRightIcon />
              </ListItemIcon>
              <ListItemText primary="To rename it, double-click on the dashboard name in the tab" />
            </ListItem>
          </List>

          <Typography variant="h6" sx={{ mt: 3 }}>
            Managing Dashboards
          </Typography>
          <Typography variant="body1">
            You can perform the following actions with dashboards:
          </Typography>
          <List sx={{ mb: 3 }}>
            <ListItem>
              <ListItemIcon>
                <KeyboardArrowRightIcon />
              </ListItemIcon>
              <ListItemText
                primary="Switch Between Dashboards"
                secondary="Click on the dashboard tabs to switch between different dashboards"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <KeyboardArrowRightIcon />
              </ListItemIcon>
              <ListItemText
                primary="Rename Dashboard"
                secondary="Double-click on the dashboard name in the tab and enter a new name"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <KeyboardArrowRightIcon />
              </ListItemIcon>
              <ListItemText
                primary="Delete Dashboard"
                secondary="Click the X icon on the dashboard tab. Confirm the deletion when prompted"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <KeyboardArrowRightIcon />
              </ListItemIcon>
              <ListItemText
                primary="Save Dashboard"
                secondary="Click the 'Save' button to save your dashboard configuration"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <KeyboardArrowRightIcon />
              </ListItemIcon>
              <ListItemText
                primary="Sync Dashboard"
                secondary="Click the 'Sync' button to sync your dashboard with the server"
              />
            </ListItem>
          </List>

          <Box sx={{ mt: 3, mb: 3 }}>
            <Chip label="Important" color="primary" sx={{ mr: 1 }} />
            <Typography variant="body1" component="span">
              Don&apos;t forget to save your dashboards using the Save button. A notification at the
              bottom of the screen will appear when you have unsaved changes.
            </Typography>
          </Box>

          <Typography variant="h6" sx={{ mt: 3 }}>
            Adding Widgets
          </Typography>
          <Typography variant="body1">To add widgets to your dashboard:</Typography>
          <List>
            <ListItem>
              <ListItemIcon>
                <KeyboardArrowRightIcon />
              </ListItemIcon>
              <ListItemText primary="Click the floating '+' button in the bottom right corner" />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <KeyboardArrowRightIcon />
              </ListItemIcon>
              <ListItemText primary="Browse the available widgets by category or use the search function" />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <KeyboardArrowRightIcon />
              </ListItemIcon>
              <ListItemText primary="Click on a widget to add it to your dashboard" />
            </ListItem>
          </List>
        </TabPanel>

        {/* Widgets Tab */}
        <TabPanel
          value={tabValue}
          index={2}
          sx={{ overflow: 'auto', maxHeight: 'calc(100vh - 220px)' }}
        >
          <Typography variant="h5" gutterBottom>
            Working with Widgets
          </Typography>

          <Typography variant="h6" sx={{ mt: 3 }}>
            Widget Management
          </Typography>
          <Typography variant="body1">
            Once you&apos;ve added widgets to your dashboard, you can:
          </Typography>
          <List sx={{ mb: 3 }}>
            <ListItem>
              <ListItemIcon>
                <KeyboardArrowRightIcon />
              </ListItemIcon>
              <ListItemText
                primary="Resize Widgets"
                secondary="Drag the edges or corners of a widget to resize it"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <KeyboardArrowRightIcon />
              </ListItemIcon>
              <ListItemText
                primary="Move Widgets"
                secondary="Click and drag a widget to move it to a different position on the dashboard"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <KeyboardArrowRightIcon />
              </ListItemIcon>
              <ListItemText
                primary="Configure Widgets"
                secondary="Click the settings icon (gear) on a widget to open its configuration dialog"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <KeyboardArrowRightIcon />
              </ListItemIcon>
              <ListItemText
                primary="Remove Widgets"
                secondary="Click the delete icon (trash) on a widget to remove it from the dashboard"
              />
            </ListItem>
          </List>

          <Typography variant="h6" sx={{ mt: 3 }}>
            Available Widget Types
          </Typography>

          <Accordion>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls="monitoring-widgets-content"
              id="monitoring-widgets-header"
            >
              <Typography variant="subtitle1">Monitoring Widgets</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <List>
                <ListItem>
                  <ListItemIcon>
                    <WidgetsIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary="Alarm Dashboard"
                    secondary="Displays system alarms with filtering capabilities"
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <WidgetsIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary="Air Consumption"
                    secondary="Shows current air consumption metrics"
                  />
                </ListItem>
              </List>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls="analytics-widgets-content"
              id="analytics-widgets-header"
            >
              <Typography variant="subtitle1">Analytics Widgets</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <List>
                <ListItem>
                  <ListItemIcon>
                    <WidgetsIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary="Operation Mode"
                    secondary="Tracks system operation mode over time"
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <WidgetsIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary="Operation Mode Pie"
                    secondary="Shows operation mode distribution as a pie chart"
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <WidgetsIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary="Uptime Rate"
                    secondary="Shows system uptime rate per day"
                  />
                </ListItem>
              </List>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls="system-widgets-content"
              id="system-widgets-header"
            >
              <Typography variant="subtitle1">System Widgets</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <List>
                <ListItem>
                  <ListItemIcon>
                    <WidgetsIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary="System Status"
                    secondary="Shows the current status of system components"
                  />
                </ListItem>
              </List>
            </AccordionDetails>
          </Accordion>
        </TabPanel>

        {/* Settings Tab */}
        <TabPanel
          value={tabValue}
          index={3}
          sx={{ overflow: 'auto', maxHeight: 'calc(100vh - 220px)' }}
        >
          <Typography variant="h5" gutterBottom>
            Settings Configuration
          </Typography>

          <Typography variant="h6" sx={{ mt: 3 }}>
            Connections
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Configure your connections to OPC UA servers and databases.
          </Typography>

          <Accordion>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls="opcua-connection-content"
              id="opcua-connection-header"
            >
              <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center' }}>
                <DnsIcon sx={{ mr: 1 }} /> OPC UA Connection
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body1" sx={{ mb: 2 }}>
                To connect to an OPC UA server:
              </Typography>
              <List>
                <ListItem>
                  <ListItemIcon>
                    <KeyboardArrowRightIcon />
                  </ListItemIcon>
                  <ListItemText primary="Enter the IP address of the OPC UA server" />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <KeyboardArrowRightIcon />
                  </ListItemIcon>
                  <ListItemText primary="Enter the port number (default is 4840)" />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <KeyboardArrowRightIcon />
                  </ListItemIcon>
                  <ListItemText primary="Enter the resource path (e.g., /UA/MyLittleServer)" />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <KeyboardArrowRightIcon />
                  </ListItemIcon>
                  <ListItemText primary="Select the security mode and policy if applicable" />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <KeyboardArrowRightIcon />
                  </ListItemIcon>
                  <ListItemText primary="Click the 'Connect' button to establish a connection" />
                </ListItem>
              </List>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls="database-connection-content"
              id="database-connection-header"
            >
              <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center' }}>
                <StorageIcon sx={{ mr: 1 }} /> Database Connection
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body1" sx={{ mb: 2 }}>
                The application uses a database to store dashboard configurations and historical
                data. You can test the database connection in the settings.
              </Typography>
              <Typography variant="body1">To test your database connection:</Typography>
              <List>
                <ListItem>
                  <ListItemIcon>
                    <KeyboardArrowRightIcon />
                  </ListItemIcon>
                  <ListItemText primary="Go to the Settings page and navigate to the Connections tab" />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <KeyboardArrowRightIcon />
                  </ListItemIcon>
                  <ListItemText primary="In the Database Connection card, click 'Test Connection'" />
                </ListItem>
              </List>
            </AccordionDetails>
          </Accordion>

          <Typography variant="h6" sx={{ mt: 3 }}>
            Appearance
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Customize the application&apos;s appearance and theme.
          </Typography>
          <List>
            <ListItem>
              <ListItemIcon>
                <KeyboardArrowRightIcon />
              </ListItemIcon>
              <ListItemText
                primary="Theme Selection"
                secondary="Choose between light and dark themes or use your system's theme"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <KeyboardArrowRightIcon />
              </ListItemIcon>
              <ListItemText
                primary="Interface Settings"
                secondary="Configure tooltips, animations, and other interface options"
              />
            </ListItem>
          </List>

          <Typography variant="h6" sx={{ mt: 3 }}>
            Backup & Restore
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Backup and restore your dashboard configurations.
          </Typography>
          <List>
            <ListItem>
              <ListItemIcon>
                <KeyboardArrowRightIcon />
              </ListItemIcon>
              <ListItemText
                primary="Export Dashboards"
                secondary="Download a backup file containing all your dashboards and configurations"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <KeyboardArrowRightIcon />
              </ListItemIcon>
              <ListItemText
                primary="Import Dashboards"
                secondary="Restore dashboards from a previously exported backup file"
              />
            </ListItem>
          </List>

          <Typography variant="h6" sx={{ mt: 3 }}>
            Certificate Management
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Manage OPC UA security certificates.
          </Typography>
          <List>
            <ListItem>
              <ListItemIcon>
                <KeyboardArrowRightIcon />
              </ListItemIcon>
              <ListItemText
                primary="Client Certificate"
                secondary="View and regenerate the client certificate used for secure OPC UA connections"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <KeyboardArrowRightIcon />
              </ListItemIcon>
              <ListItemText
                primary="Trusted Certificates"
                secondary="Manage trusted server certificates"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <KeyboardArrowRightIcon />
              </ListItemIcon>
              <ListItemText
                primary="Rejected Certificates"
                secondary="View and accept previously rejected certificates"
              />
            </ListItem>
          </List>
        </TabPanel>

        {/* Troubleshooting Tab */}
        <TabPanel
          value={tabValue}
          index={4}
          sx={{ overflow: 'auto', maxHeight: 'calc(100vh - 220px)' }}
        >
          <Typography variant="h5" gutterBottom>
            Troubleshooting
          </Typography>

          <Typography variant="h6" sx={{ mt: 3 }}>
            Common Issues
          </Typography>

          <Accordion>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls="connection-issues-content"
              id="connection-issues-header"
            >
              <Typography variant="subtitle1">Connection Issues</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="h6" gutterBottom>
                Problem: Cannot connect to OPC UA server
              </Typography>
              <Typography variant="body1" sx={{ mb: 2 }}>
                Possible solutions:
              </Typography>
              <List sx={{ mb: 3 }}>
                <ListItem>
                  <ListItemIcon>
                    <KeyboardArrowRightIcon />
                  </ListItemIcon>
                  <ListItemText primary="Verify that the OPC UA server is running and accessible" />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <KeyboardArrowRightIcon />
                  </ListItemIcon>
                  <ListItemText primary="Check the IP address and port number for accuracy" />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <KeyboardArrowRightIcon />
                  </ListItemIcon>
                  <ListItemText primary="Ensure the resource path is correct" />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <KeyboardArrowRightIcon />
                  </ListItemIcon>
                  <ListItemText primary="Check if the security settings match the server's configuration" />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <KeyboardArrowRightIcon />
                  </ListItemIcon>
                  <ListItemText primary="Verify that the server's certificate is trusted" />
                </ListItem>
              </List>

              <Typography variant="h6" gutterBottom>
                Problem: Database connection issues
              </Typography>
              <Typography variant="body1" sx={{ mb: 2 }}>
                Possible solutions:
              </Typography>
              <List>
                <ListItem>
                  <ListItemIcon>
                    <KeyboardArrowRightIcon />
                  </ListItemIcon>
                  <ListItemText primary="Check if the database service is running" />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <KeyboardArrowRightIcon />
                  </ListItemIcon>
                  <ListItemText primary="Verify database credentials and connection settings" />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <KeyboardArrowRightIcon />
                  </ListItemIcon>
                  <ListItemText primary="Restart the application and try again" />
                </ListItem>
              </List>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls="widget-issues-content"
              id="widget-issues-header"
            >
              <Typography variant="subtitle1">Widget Issues</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="h6" gutterBottom>
                Problem: Widget not displaying data
              </Typography>
              <Typography variant="body1" sx={{ mb: 2 }}>
                Possible solutions:
              </Typography>
              <List sx={{ mb: 3 }}>
                <ListItem>
                  <ListItemIcon>
                    <KeyboardArrowRightIcon />
                  </ListItemIcon>
                  <ListItemText primary="Ensure the OPC UA server is connected" />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <KeyboardArrowRightIcon />
                  </ListItemIcon>
                  <ListItemText primary="Check the widget's configuration settings" />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <KeyboardArrowRightIcon />
                  </ListItemIcon>
                  <ListItemText primary="Try refreshing the widget or dashboard" />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <KeyboardArrowRightIcon />
                  </ListItemIcon>
                  <ListItemText primary="Remove and add the widget again" />
                </ListItem>
              </List>

              <Typography variant="h6" gutterBottom>
                Problem: Widget layout or styling issues
              </Typography>
              <Typography variant="body1" sx={{ mb: 2 }}>
                Possible solutions:
              </Typography>
              <List>
                <ListItem>
                  <ListItemIcon>
                    <KeyboardArrowRightIcon />
                  </ListItemIcon>
                  <ListItemText primary="Try resizing the widget" />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <KeyboardArrowRightIcon />
                  </ListItemIcon>
                  <ListItemText primary="Check if the widget has a minimum size requirement" />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <KeyboardArrowRightIcon />
                  </ListItemIcon>
                  <ListItemText primary="Try switching between light and dark themes" />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <KeyboardArrowRightIcon />
                  </ListItemIcon>
                  <ListItemText primary="Remove and add the widget again" />
                </ListItem>
              </List>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls="certificate-issues-content"
              id="certificate-issues-header"
            >
              <Typography variant="subtitle1">Certificate Issues</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="h6" gutterBottom>
                Problem: Certificate trust issues
              </Typography>
              <Typography variant="body1" sx={{ mb: 2 }}>
                Possible solutions:
              </Typography>
              <List>
                <ListItem>
                  <ListItemIcon>
                    <KeyboardArrowRightIcon />
                  </ListItemIcon>
                  <ListItemText primary="Check for certificate notifications in the application" />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <KeyboardArrowRightIcon />
                  </ListItemIcon>
                  <ListItemText primary="Go to Settings > Certificates to manage trusted certificates" />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <KeyboardArrowRightIcon />
                  </ListItemIcon>
                  <ListItemText primary="Try regenerating the client certificate in the Certificate Management section" />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <KeyboardArrowRightIcon />
                  </ListItemIcon>
                  <ListItemText primary="Check if rejected certificates need to be accepted" />
                </ListItem>
              </List>
            </AccordionDetails>
          </Accordion>

          <Box sx={{ mt: 4, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
            <Typography variant="h6" gutterBottom>
              System Information
            </Typography>
            <Typography variant="body1">
              If you need to contact support, please provide the following information:
            </Typography>
            <List>
              <ListItem>
                <ListItemIcon>
                  <KeyboardArrowRightIcon />
                </ListItemIcon>
                <ListItemText primary="Application version" />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <KeyboardArrowRightIcon />
                </ListItemIcon>
                <ListItemText primary="Operating system" />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <KeyboardArrowRightIcon />
                </ListItemIcon>
                <ListItemText primary="Browser (if applicable)" />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <KeyboardArrowRightIcon />
                </ListItemIcon>
                <ListItemText primary="Error messages (if any)" />
              </ListItem>
            </List>
            <Typography variant="body1" sx={{ mt: 2 }}>
              You can find system information in Settings/System Info.
            </Typography>
          </Box>
        </TabPanel>
      </Paper>
    </Box>
  );
};

export default HelpPage;
