import React, { useState, useMemo } from 'react';
import { Box, Typography, Paper, Tab, Tabs } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';
import RestoreIcon from '@mui/icons-material/Restore';
import AssessmentIcon from '@mui/icons-material/Assessment';
import SettingsIcon from '@mui/icons-material/Settings';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ScienceIcon from '@mui/icons-material/Science';

import ComplianceOverviewTab from '../tabs/ComplianceOverviewTab';
import ComplianceAuditTrailTab from '../tabs/ComplianceAuditTrailTab';
import ComplianceVersionsTab from '../tabs/ComplianceVersionsTab';
import ComplianceReportsTab from '../tabs/ComplianceReportsTab';
import ComplianceConfigTab from '../tabs/ComplianceConfigTab';
import RecipesPage from '../../recipes/pages/RecipesPage';
import BatchesPage from '../../recipes/pages/BatchesPage';

interface TabPanelProps {
  children: React.ReactNode;
  value: number;
  index: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <Box
    role="tabpanel"
    hidden={value !== index}
    sx={{ p: 3, flexGrow: 1, overflow: 'auto' }}
  >
    {value === index && children}
  </Box>
);

const CompliancePage: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);

  const tabs = useMemo(
    () => [
      { label: 'Overview', icon: <DashboardIcon />, content: <ComplianceOverviewTab /> },
      { label: 'Audit Trail', icon: <HistoryEduIcon />, content: <ComplianceAuditTrailTab /> },
      { label: 'Process Specs', icon: <MenuBookIcon />, content: <RecipesPage /> },
      { label: 'Batch Monitoring', icon: <ScienceIcon />, content: <BatchesPage /> },
      { label: 'Versions', icon: <RestoreIcon />, content: <ComplianceVersionsTab /> },
      { label: 'Reports', icon: <AssessmentIcon />, content: <ComplianceReportsTab /> },
      { label: 'Configuration', icon: <SettingsIcon />, content: <ComplianceConfigTab /> },
    ],
    [],
  );

  return (
    <Box
      sx={{
        p: { xs: 2, md: 3 },
        maxWidth: 1400,
        mx: 'auto',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Typography variant="h4" gutterBottom sx={{ mb: 2 }}>
        Compliance & Audit
      </Typography>

      <Paper sx={{ width: '100%', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <Tabs
          value={tabValue}
          onChange={(_e, v) => setTabValue(v)}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="compliance tabs"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          {tabs.map((tab, index) => (
            <Tab
              key={tab.label}
              label={tab.label}
              id={`compliance-tab-${index}`}
              icon={tab.icon}
              iconPosition="start"
            />
          ))}
        </Tabs>

        {tabs.map((tab, index) => (
          <TabPanel key={tab.label} value={tabValue} index={index}>
            {tab.content}
          </TabPanel>
        ))}
      </Paper>
    </Box>
  );
};

export default CompliancePage;
