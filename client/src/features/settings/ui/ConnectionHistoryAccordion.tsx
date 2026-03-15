import React from 'react';
import { Typography, Box, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

interface ConnectionHistoryEntry {
  event: string;
  timestamp: string;
  details: string;
}

interface ConnectionHistoryAccordionProps {
  connectionHistory: ConnectionHistoryEntry[];
  formatDate: (date: string | Date | null | undefined) => string;
}

const ConnectionHistoryAccordion: React.FC<ConnectionHistoryAccordionProps> = ({
  connectionHistory,
  formatDate,
}) => (
  <Accordion>
    <AccordionSummary
      expandIcon={<ExpandMoreIcon />}
      aria-controls="connection-history-content"
      id="connection-history-header"
    >
      <Typography variant="subtitle1">Connection History</Typography>
    </AccordionSummary>
    <AccordionDetails>
      {connectionHistory.length === 0 ? (
        <Typography variant="body2" color="text.secondary" align="center">
          No connection history available
        </Typography>
      ) : (
        <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
          {connectionHistory.map((entry: ConnectionHistoryEntry, index: number) => (
            <Box
              key={index}
              sx={{
                mb: 1,
                p: 1,
                borderBottom: index < connectionHistory.length - 1 ? '1px solid' : 'none',
                borderColor: 'divider',
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="subtitle2">{entry.event}</Typography>
                <Typography variant="caption">{formatDate(entry.timestamp)}</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                {entry.details}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </AccordionDetails>
  </Accordion>
);

export default ConnectionHistoryAccordion;
