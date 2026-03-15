import React, { useCallback } from 'react';
import { FixedSizeGrid as Grid } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

interface VirtualizedGridItem {
  id: string | number;
  [key: string]: unknown;
}

interface RenderItemProps {
  item: VirtualizedGridItem;
  index: number;
}

interface VirtualizedGridProps {
  items: VirtualizedGridItem[];
  renderItem: (props: RenderItemProps) => React.ReactNode;
  columnCount?: number;
  rowHeight?: number;
}

/**
 * Virtualized grid component for efficient rendering of large lists of items
 * @param root0
 * @param root0.items
 * @param root0.renderItem
 * @param root0.columnCount
 * @param root0.rowHeight
 */
const VirtualizedGrid: React.FC<VirtualizedGridProps> = ({
  items,
  renderItem,
  columnCount = 12,
  rowHeight = 200,
}) => {
  const getColumnWidth = useCallback((width: number): number => width / columnCount, [columnCount]);

  // Calculate how many rows we need based on item count and columns
  const rowCount = Math.ceil(items.length / columnCount);

  // Map from flat index to row/column coordinates
  const getItemKey = useCallback(
    ({ columnIndex, rowIndex }: { columnIndex: number; rowIndex: number }): string => {
      const index = rowIndex * columnCount + columnIndex;
      // eslint-disable-next-line security/detect-object-injection -- index is computed from row/column and bounds-checked
      return index < items.length ? String(items[index].id) : `empty-${rowIndex}-${columnIndex}`;
    },
    [items, columnCount],
  );

  // Render cell
  const Cell = useCallback(
    ({
      columnIndex,
      rowIndex,
      style,
    }: {
      columnIndex: number;
      rowIndex: number;
      style: React.CSSProperties;
    }) => {
      const index = rowIndex * columnCount + columnIndex;

      // Return empty cell if index is out of bounds
      if (index >= items.length) {
        return <div style={style} />;
      }

      // Otherwise render the item
      // eslint-disable-next-line security/detect-object-injection -- index is computed from row/column and bounds-checked above
      return <div style={style}>{renderItem({ item: items[index], index })}</div>;
    },
    [items, columnCount, renderItem],
  );

  return (
    <AutoSizer>
      {({ height, width }: { height: number; width: number }) => (
        <Grid
          columnCount={columnCount}
          columnWidth={getColumnWidth(width)}
          height={height}
          rowCount={rowCount}
          rowHeight={rowHeight}
          width={width}
          itemKey={getItemKey}
        >
          {Cell}
        </Grid>
      )}
    </AutoSizer>
  );
};

export default React.memo(VirtualizedGrid);
