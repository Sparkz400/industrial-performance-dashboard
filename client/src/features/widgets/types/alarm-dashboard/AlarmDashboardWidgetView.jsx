import React, { useState } from 'react';
import {
    Card,
    CardContent,
    Typography,
    Box,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TablePagination,
    Paper,
    Chip,
    IconButton,
    CircularProgress
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import { SEVERITY_LEVELS, ALARM_STATUS } from './useAlarmData.js';

// Format ISO date to readable format
const formatDate = (isoDate) => {
    if (!isoDate) return '-';
    const date = new Date(isoDate);
    return date.toLocaleString();
};

// Get appropriate severity color
const getSeverityColor = (severity) => {
    switch (severity) {
        case SEVERITY_LEVELS.CRITICAL:
        case SEVERITY_LEVELS.HIGH:
            return 'error';
        case SEVERITY_LEVELS.MEDIUM:
        case SEVERITY_LEVELS.LOW:
            return 'warning';
        default:
            return 'info';
    }
};

// Get appropriate status color
const getStatusColor = (status) => {
    switch (status) {
        case ALARM_STATUS.ACTIVE:
            return 'error';
        case ALARM_STATUS.ACKNOWLEDGED:
            return 'warning';
        case ALARM_STATUS.CLEARED:
            return 'success';
        default:
            return 'default';
    }
};

function AlarmDashboardWidgetView({ alarms, loading, error, onAcknowledge, onClear }) {
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(5);

    // Simple handlers with no dependencies
    const handleChangePage = (event, newPage) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    // Display loading state
    if (loading) {
        return (
            <Card sx={{ width: '100%', height: '100%' }}>
                <CardContent sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%'
                }}>
                    <CircularProgress />
                </CardContent>
            </Card>
        );
    }

    // Display error state
    if (error) {
        return (
            <Card sx={{ width: '100%', height: '100%' }}>
                <CardContent>
                    <Typography color="error">{error}</Typography>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ p: 2, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                <Typography variant="h6" gutterBottom>
                    Alarm Dashboard
                </Typography>

                <TableContainer component={Paper} sx={{ flexGrow: 1 }}>
                    <Table size="small" stickyHeader>
                        <TableHead>
                            <TableRow>
                                <TableCell>Time</TableCell>
                                <TableCell>Severity</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Source</TableCell>
                                <TableCell>Message</TableCell>
                                <TableCell>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {alarms.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((alarm) => (
                                <TableRow key={alarm.id}>
                                    <TableCell>{formatDate(alarm.time)}</TableCell>
                                    <TableCell>
                                        <Chip
                                            label={alarm.severity}
                                            color={getSeverityColor(alarm.severity)}
                                            size="small"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={alarm.status}
                                            color={getStatusColor(alarm.status)}
                                            size="small"
                                        />
                                    </TableCell>
                                    <TableCell>{alarm.source}</TableCell>
                                    <TableCell>{alarm.message}</TableCell>
                                    <TableCell>
                                        {alarm.status === ALARM_STATUS.ACTIVE && (
                                            <IconButton
                                                size="small"
                                                onClick={() => onAcknowledge(alarm.id)}
                                            >
                                                <CheckCircleOutlineIcon fontSize="small" />
                                            </IconButton>
                                        )}

                                        {alarm.status !== ALARM_STATUS.CLEARED && (
                                            <IconButton
                                                size="small"
                                                onClick={() => onClear(alarm.id)}
                                            >
                                                <DoneAllIcon fontSize="small" />
                                            </IconButton>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>

                <TablePagination
                    rowsPerPageOptions={[5, 10, 25]}
                    component="div"
                    count={alarms.length}
                    rowsPerPage={rowsPerPage}
                    page={page}
                    onPageChange={handleChangePage}
                    onRowsPerPageChange={handleChangeRowsPerPage}
                />
            </CardContent>
        </Card>
    );
}

export default AlarmDashboardWidgetView;