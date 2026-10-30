import React from 'react';
import { Box, Chip, Divider, Drawer, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import WarningIcon from '@mui/icons-material/Warning';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import type { ComplianceLogEntry } from '../hooks/useComplianceQueries';

interface AuditDetailDrawerProps {
  entry: ComplianceLogEntry | null;
  open: boolean;
  onClose: () => void;
}

const DRAWER_WIDTH = 500;

const getActionColor = (
  action: string,
): 'default' | 'success' | 'primary' | 'error' | 'warning' => {
  switch (action) {
    case 'CREATE':
      return 'success';
    case 'UPDATE':
      return 'primary';
    case 'DELETE':
      return 'error';
    case 'RESTORE':
      return 'warning';
    default:
      return 'default';
  }
};

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography
    variant="subtitle1"
    sx={{
      fontWeight: 'bold',
      mt: 2,
      mb: 1,
    }}
  >
    {children}
  </Typography>
);

const FieldRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <Stack
    direction="row"
    sx={{
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      py: 0.5,
    }}
  >
    <Typography
      variant="body2"
      sx={{
        color: 'text.secondary',
        minWidth: 140,
        flexShrink: 0,
      }}
    >
      {label}
    </Typography>
    <Box sx={{ textAlign: 'right', maxWidth: 300, wordBreak: 'break-word' }}>{children}</Box>
  </Stack>
);

const AuditDetailDrawer: React.FC<AuditDetailDrawerProps> = ({ entry, open, onClose }) => {
  const reasonValue = entry?.reasonForChange || entry?.reason;
  const hasSnapshots = entry?.snapshotBefore || entry?.snapshotAfter;
  const hasMetadata = entry?.metadata && Object.keys(entry.metadata).length > 0;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: { sx: { width: DRAWER_WIDTH, maxWidth: '100vw' } },
      }}
    >
      {/* Header */}
      <Stack
        direction="row"
        sx={{
          justifyContent: 'space-between',
          alignItems: 'center',
          px: 2,
          py: 1.5,
        }}
      >
        <Typography variant="h6">Audit Log Detail</Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </Stack>
      <Divider />

      {entry && (
        <Box sx={{ px: 2, pb: 3, overflowY: 'auto' }}>
          {/* Section 1: Event Info */}
          <SectionTitle>Event Info</SectionTitle>
          <FieldRow label="Action">
            <Chip
              label={entry.action}
              color={getActionColor(entry.action)}
              size="small"
              variant="outlined"
            />
          </FieldRow>
          <FieldRow label="Entity Type">
            <Typography variant="body2">{entry.entityType}</Typography>
          </FieldRow>
          <FieldRow label="Entity ID">
            <Typography
              variant="body2"
              sx={{
                fontFamily: 'monospace',
                fontSize: '0.8rem',
              }}
            >
              {entry.entityId}
            </Typography>
          </FieldRow>
          {entry.entityName && (
            <FieldRow label="Entity Name">
              <Typography variant="body2">{entry.entityName}</Typography>
            </FieldRow>
          )}
          <FieldRow label="Message">
            <Typography variant="body2">{entry.message}</Typography>
          </FieldRow>
          <FieldRow label="Timestamp">
            <Typography variant="body2">{new Date(entry.createdAt).toLocaleString()}</Typography>
          </FieldRow>

          <Divider sx={{ mt: 1 }} />

          {/* Section 2: Actor Info */}
          <SectionTitle>Actor Info</SectionTitle>
          <FieldRow label="Username">
            <Typography variant="body2">{entry.username}</Typography>
          </FieldRow>
          <FieldRow label="User Role">
            <Typography variant="body2">{entry.userRole ?? '-'}</Typography>
          </FieldRow>
          <FieldRow label="IP Address">
            <Typography variant="body2">{entry.ipAddress ?? '-'}</Typography>
          </FieldRow>

          <Divider sx={{ mt: 1 }} />

          {/* Section 3: Compliance Details */}
          <SectionTitle>Compliance Details</SectionTitle>
          <FieldRow label="Reason for Change">
            {reasonValue ? (
              <Typography variant="body2">{reasonValue}</Typography>
            ) : (
              <Stack
                direction="row"
                spacing={0.5}
                sx={{
                  alignItems: 'center',
                }}
              >
                <WarningAmberIcon fontSize="small" color="warning" />
                <Typography
                  variant="body2"
                  sx={{
                    color: 'warning.main',
                  }}
                >
                  Not provided
                </Typography>
              </Stack>
            )}
          </FieldRow>
          <FieldRow label="Electronic Signature">
            {entry.electronicSignature ? (
              <Stack
                direction="row"
                spacing={0.5}
                sx={{
                  alignItems: 'center',
                }}
              >
                <VerifiedUserIcon fontSize="small" color="success" />
                <Typography
                  variant="body2"
                  sx={{
                    color: 'success.main',
                  }}
                >
                  {String(
                    (entry.electronicSignature as Record<string, unknown>).meaning ?? 'Signed',
                  )}{' '}
                  by {(entry.electronicSignature as Record<string, unknown>).username as string} at{' '}
                  {(entry.electronicSignature as Record<string, unknown>).signedAt as string}
                </Typography>
              </Stack>
            ) : (
              <Stack
                direction="row"
                spacing={0.5}
                sx={{
                  alignItems: 'center',
                }}
              >
                <WarningIcon fontSize="small" color="warning" />
                <Typography
                  variant="body2"
                  sx={{
                    color: 'warning.main',
                  }}
                >
                  Not electronically signed
                </Typography>
              </Stack>
            )}
          </FieldRow>

          <Divider sx={{ mt: 1 }} />

          {/* Section 4: Chain Integrity */}
          <SectionTitle>Chain Integrity</SectionTitle>
          <FieldRow label="Checksum">
            <Tooltip title={entry.checksum} arrow>
              <Typography
                variant="body2"
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  maxWidth: 200,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {entry.checksum}
              </Typography>
            </Tooltip>
          </FieldRow>
          <FieldRow label="Previous Checksum">
            {entry.previousChecksum ? (
              <Tooltip title={entry.previousChecksum} arrow>
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    maxWidth: 200,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {entry.previousChecksum}
                </Typography>
              </Tooltip>
            ) : (
              <Typography
                variant="body2"
                sx={{
                  color: 'text.secondary',
                }}
              >
                -
              </Typography>
            )}
          </FieldRow>

          {/* Section 5: Snapshots */}
          {hasSnapshots && (
            <>
              <Divider sx={{ mt: 1 }} />
              <SectionTitle>Snapshots</SectionTitle>

              {entry.snapshotBefore && (
                <Box sx={{ mb: 1.5 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      color: 'text.secondary',
                      mb: 0.5,
                    }}
                  >
                    Before
                  </Typography>
                  <Box
                    component="pre"
                    sx={{
                      p: 1.5,
                      borderRadius: 1,
                      bgcolor: 'grey.100',
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      overflow: 'auto',
                      maxHeight: 300,
                      m: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {JSON.stringify(entry.snapshotBefore, null, 2)}
                  </Box>
                </Box>
              )}

              {entry.snapshotAfter && (
                <Box sx={{ mb: 1.5 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      color: 'text.secondary',
                      mb: 0.5,
                    }}
                  >
                    After
                  </Typography>
                  <Box
                    component="pre"
                    sx={{
                      p: 1.5,
                      borderRadius: 1,
                      bgcolor: 'grey.100',
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      overflow: 'auto',
                      maxHeight: 300,
                      m: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {JSON.stringify(entry.snapshotAfter, null, 2)}
                  </Box>
                </Box>
              )}
            </>
          )}

          {/* Section 6: Metadata */}
          {hasMetadata && (
            <>
              <Divider sx={{ mt: 1 }} />
              <SectionTitle>Metadata</SectionTitle>
              <Box
                component="pre"
                sx={{
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: 'grey.100',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  overflow: 'auto',
                  maxHeight: 300,
                  m: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {JSON.stringify(entry.metadata, null, 2)}
              </Box>
            </>
          )}
        </Box>
      )}
    </Drawer>
  );
};

export default AuditDetailDrawer;
