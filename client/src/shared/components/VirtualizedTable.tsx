import React, { useCallback, useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import {
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableContainer,
  Paper,
  Box,
  Typography,
} from '@mui/material';

export interface VirtualizedColumn<T> {
  key: string;
  header: string;
  width?: number | string;
  render: (row: T, index: number) => React.ReactNode;
}

interface VirtualizedTableProps<T> {
  rows: T[];
  columns: VirtualizedColumn<T>[];
  rowHeight?: number;
  maxHeight?: number;
  getRowKey: (row: T, index: number) => string | number;
  emptyMessage?: string;
  stickyHeader?: boolean;
}

/**
 *
 * @param root0
 * @param root0.rows
 * @param root0.columns
 * @param root0.rowHeight
 * @param root0.maxHeight
 * @param root0.getRowKey
 * @param root0.emptyMessage
 * @param root0.stickyHeader
 */
function VirtualizedTableInner<T>({
  rows,
  columns,
  rowHeight = 48,
  maxHeight = 600,
  getRowKey,
  emptyMessage = 'No data available',
  stickyHeader = true,
}: VirtualizedTableProps<T>) {
  const Row = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      // eslint-disable-next-line security/detect-object-injection -- index is from react-window, always numeric
      const row = rows[index];
      return (
        <TableRow
          component="div"
          hover
          sx={{
            display: 'flex',
            alignItems: 'center',
            boxSizing: 'border-box',
            borderBottom: '1px solid',
            borderColor: 'divider',
            ...style,
          }}
          key={getRowKey(row, index)}
        >
          {columns.map((col) => (
            <TableCell
              component="div"
              key={col.key}
              sx={{
                flex: col.width
                  ? `0 0 ${typeof col.width === 'number' ? `${col.width}px` : col.width}`
                  : 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                borderBottom: 'none',
                py: 0,
                height: rowHeight,
              }}
            >
              {col.render(row, index)}
            </TableCell>
          ))}
        </TableRow>
      );
    },
    [rows, columns, rowHeight, getRowKey],
  );

  const headerRow = useMemo(
    () => (
      <TableHead component="div">
        <TableRow
          component="div"
          sx={{
            display: 'flex',
            alignItems: 'center',
            borderBottom: '2px solid',
            borderColor: 'divider',
            position: stickyHeader ? 'sticky' : undefined,
            top: 0,
            zIndex: 1,
            bgcolor: 'background.paper',
          }}
        >
          {columns.map((col) => (
            <TableCell
              component="div"
              key={col.key}
              sx={{
                flex: col.width
                  ? `0 0 ${typeof col.width === 'number' ? `${col.width}px` : col.width}`
                  : 1,
                fontWeight: 'bold',
                borderBottom: 'none',
              }}
            >
              {col.header}
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
    ),
    [columns, stickyHeader],
  );

  if (rows.length === 0) {
    return (
      <TableContainer component={Paper} variant="outlined">
        <Table component="div">{headerRow}</Table>
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            {emptyMessage}
          </Typography>
        </Box>
      </TableContainer>
    );
  }

  const listHeight = Math.min(rows.length * rowHeight, maxHeight);

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table component="div">{headerRow}</Table>
      <AutoSizer disableHeight>
        {({ width }: { width: number }) => (
          <List height={listHeight} itemCount={rows.length} itemSize={rowHeight} width={width}>
            {Row}
          </List>
        )}
      </AutoSizer>
    </TableContainer>
  );
}

const VirtualizedTable = React.memo(VirtualizedTableInner) as typeof VirtualizedTableInner;

export default VirtualizedTable;
