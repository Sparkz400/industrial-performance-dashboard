import React from 'react';
import { Box, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import type { OeeResponse } from './useOeeData';
/**
 * Show actual aggregate coverage without inventing per-source provenance.
 * @param root0 Evidence options.
 * @param root0.rows Returned aggregate records.
 */
export default function OeeEvidence({ rows }: { rows: (OeeResponse | undefined)[] }) {
  return (
    <details className="no-drag">
      <summary>OEE coverage evidence</summary>
      <Typography variant="caption">
        Aggregate coverage from the selected window; raw source and receive timestamps are not
        included by this legacy OEE API. Inspect machine history for original measurements. Latest
        100 buckets shown.
      </Typography>
      <Box
        sx={{ overflowX: 'auto', maxHeight: 240 }}
        tabIndex={0}
        role="region"
        aria-label="OEE coverage evidence"
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              {[
                'Window',
                'Unknown state minutes',
                'Counter coverage',
                'Good / reject coverage',
              ].map((label) => (
                <TableCell key={label}>{label}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.slice(-100).map((row, index) => (
              <TableRow key={index}>
                <TableCell>
                  {row?.startDate ?? 'Unknown'} — {row?.endDate ?? 'Unknown'}
                </TableCell>
                <TableCell>{row?.availability?.unknownTimeMinutes ?? 'Unknown'}</TableCell>
                <TableCell>
                  {row?.performance?.dataComplete === undefined
                    ? 'Unknown'
                    : row.performance.dataComplete
                      ? 'Complete'
                      : 'Incomplete'}
                </TableCell>
                <TableCell>
                  {row?.quality?.dataComplete === undefined
                    ? 'Unknown'
                    : row.quality.dataComplete
                      ? 'Complete'
                      : 'Incomplete'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </details>
  );
}
