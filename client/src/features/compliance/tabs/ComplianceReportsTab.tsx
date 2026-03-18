import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  CardHeader,
  Button,
  TextField,
  MenuItem,
  Alert,
  CircularProgress,
  Stack,
  Chip,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import AssessmentIcon from '@mui/icons-material/Assessment';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import DescriptionIcon from '@mui/icons-material/Description';
import SecurityIcon from '@mui/icons-material/Security';
import { useGenerateReport } from '../hooks/useComplianceQueries';

interface ReportTypeOption {
  type: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const REPORT_TYPES: ReportTypeOption[] = [
  {
    type: 'audit-trail',
    title: 'Audit Trail Report',
    description: 'Full compliance event log with all details',
    icon: <DescriptionIcon fontSize="large" />,
  },
  {
    type: 'signature-coverage',
    title: 'Signature Coverage',
    description: 'Analysis of electronic signature compliance',
    icon: <SecurityIcon fontSize="large" />,
  },
  {
    type: 'change-reasons',
    title: 'Change Reasons',
    description: 'Analysis of documented change reasons',
    icon: <AssessmentIcon fontSize="large" />,
  },
  {
    type: 'integrity',
    title: 'Integrity Verification',
    description: 'Cryptographic chain integrity verification',
    icon: <SecurityIcon fontSize="large" />,
  },
];

const ComplianceReportsTab: React.FC = () => {
  const [reportType, setReportType] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [format, setFormat] = useState<'csv' | 'json'>('json');
  const [generatedReport, setGeneratedReport] = useState<unknown | null>(null);

  const { mutate: generateReport, isPending, error } = useGenerateReport();

  const handleGenerate = () => {
    setGeneratedReport(null);

    generateReport(
      {
        reportType,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        format,
      },
      {
        onSuccess: (data) => {
          if (format === 'csv') {
            const blob = new Blob([data as string], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${reportType}-report-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            setGeneratedReport(data);
          } else {
            setGeneratedReport(data);
          }
        },
      },
    );
  };

  const renderReportSummary = () => {
    if (!generatedReport || format !== 'json') return null;

    const report = generatedReport as Record<string, unknown>;

    return (
      <Card variant="outlined" sx={{ mt: 3 }}>
        <CardHeader title="Report Summary" />
        <CardContent>
          <Stack spacing={2}>
            {report.totalRecords !== undefined && (
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" color="text.secondary">
                  Total Records:
                </Typography>
                <Chip label={String(report.totalRecords)} size="small" color="primary" />
              </Stack>
            )}
            {report.signatureCoverage !== undefined && (
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" color="text.secondary">
                  Signature Coverage:
                </Typography>
                <Chip
                  label={`${Number(report.signatureCoverage).toFixed(1)}%`}
                  size="small"
                  color={Number(report.signatureCoverage) >= 80 ? 'success' : 'warning'}
                />
              </Stack>
            )}
            {report.reasonCoverage !== undefined && (
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" color="text.secondary">
                  Reason Coverage:
                </Typography>
                <Chip
                  label={`${Number(report.reasonCoverage).toFixed(1)}%`}
                  size="small"
                  color={Number(report.reasonCoverage) >= 80 ? 'success' : 'warning'}
                />
              </Stack>
            )}
            {report.valid !== undefined && (
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" color="text.secondary">
                  Integrity Valid:
                </Typography>
                <Chip
                  label={report.valid ? 'Passed' : 'Failed'}
                  size="small"
                  color={report.valid ? 'success' : 'error'}
                />
              </Stack>
            )}
            <Box
              sx={{
                mt: 2,
                p: 2,
                bgcolor: 'grey.50',
                borderRadius: 1,
                maxHeight: 400,
                overflow: 'auto',
              }}
            >
              <Typography
                variant="body2"
                component="pre"
                sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              >
                {JSON.stringify(generatedReport, null, 2)}
              </Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    );
  };

  return (
    <Box>
      {/* Report Type Selection */}
      <Typography variant="h6" gutterBottom>
        Select Report Type
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {REPORT_TYPES.map((rt) => (
          <Grid key={rt.type} size={{ xs: 12, sm: 6, md: 3 }}>
            <Card
              variant="outlined"
              sx={{
                cursor: 'pointer',
                height: '100%',
                borderColor: reportType === rt.type ? 'primary.main' : 'divider',
                borderWidth: reportType === rt.type ? 2 : 1,
                transition: 'border-color 0.2s, box-shadow 0.2s',
                '&:hover': {
                  borderColor: 'primary.light',
                  boxShadow: 1,
                },
              }}
              onClick={() => setReportType(rt.type)}
            >
              <CardContent sx={{ textAlign: 'center' }}>
                <Box sx={{ color: reportType === rt.type ? 'primary.main' : 'text.secondary', mb: 1 }}>
                  {rt.icon}
                </Box>
                <Typography variant="subtitle1" gutterBottom>
                  {rt.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {rt.description}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Filters Section */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Report Filters
        </Typography>
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="flex-end">
          <TextField
            label="Date From"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Date To"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            select
            label="Format"
            value={format}
            onChange={(e) => setFormat(e.target.value as 'csv' | 'json')}
            size="small"
            sx={{ minWidth: 120 }}
          >
            <MenuItem value="csv">CSV</MenuItem>
            <MenuItem value="json">JSON</MenuItem>
          </TextField>
          <Button
            variant="contained"
            startIcon={isPending ? <CircularProgress size={18} color="inherit" /> : <AssessmentIcon />}
            onClick={handleGenerate}
            disabled={!reportType || isPending}
          >
            {isPending ? 'Generating...' : 'Generate Report'}
          </Button>
        </Stack>
      </Paper>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Failed to generate report: {(error as Error).message}
        </Alert>
      )}

      {/* Results Section */}
      {generatedReport !== null && (
        <Box>
          {format === 'csv' ? (
            <Paper sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="body1" gutterBottom>
                Report generated successfully. Your download should have started automatically.
              </Typography>
              <Button
                variant="outlined"
                startIcon={<FileDownloadIcon />}
                onClick={() => {
                  const blob = new Blob([generatedReport as string], {
                    type: 'text/csv;charset=utf-8;',
                  });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `${reportType}-report-${new Date().toISOString().slice(0, 10)}.csv`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  URL.revokeObjectURL(url);
                }}
              >
                Download Again
              </Button>
            </Paper>
          ) : (
            renderReportSummary()
          )}
        </Box>
      )}
    </Box>
  );
};

export default ComplianceReportsTab;
