import React from 'react';
import { Box, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { useT } from '@/i18n';
import type { NodeDataPoint } from '../hooks/widgetReadings';
/**
 * Inspect the source facts without turning missing or rejected readings into zeros.
 * @param root0 Evidence options.
 * @param root0.rows Source readings.
 */
export default function WidgetReadingEvidence({ rows }: { rows: NodeDataPoint[] }) {
  const t = useT();
  return (
    <details className="no-drag">
      <summary>{t('Measurement evidence (last 20)', 'Messnachweis (letzte 20)')}</summary>
      <Typography variant="caption">
        {t(
          'Rejected readings and gaps remain unknown. Raw values and source / receive times are preserved.',
          'Verworfene Messungen und Lücken bleiben unbekannt. Rohwerte sowie Quellen- und Empfangszeiten bleiben erhalten.',
        )}
      </Typography>
      <Box
        sx={{ overflowX: 'auto', maxHeight: 240 }}
        tabIndex={0}
        role="region"
        aria-label={t('Measurement evidence', 'Messnachweis')}
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              {[
                t('Observation', 'Beobachtung'),
                t('Value / raw', 'Wert / roh'),
                t('Quality / correction', 'Qualität / Korrektur'),
                t('Source time', 'Quellenzeit'),
                t('Received', 'Empfangen'),
              ].map((label) => (
                <TableCell key={label}>{label}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.slice(-20).map((row, index) => (
              <TableRow key={row.timestamp + index}>
                <TableCell>{row.timestamp}</TableCell>
                <TableCell>
                  {row.value == null ? t('Unknown', 'Unbekannt') : row.value} /{' '}
                  {JSON.stringify(row.rawValue) ?? '—'}
                </TableCell>
                <TableCell>
                  {row.statusCode ?? t('Unknown', 'Unbekannt')}
                  {row.correctionRevision
                    ? ` · ${t('Correction', 'Korrektur')} ${row.correctionRevision} (${row.reportedStatusCode ?? '—'})`
                    : ''}
                </TableCell>
                <TableCell>{row.sourceTimestamp ?? '—'}</TableCell>
                <TableCell>{row.receivedAt ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </details>
  );
}
