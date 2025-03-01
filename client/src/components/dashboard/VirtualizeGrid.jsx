import React, { useCallback } from 'react';
import PropTypes from 'prop-types';
import { FixedSizeGrid as Grid } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

/**
 * Virtualized grid component for efficient rendering of large lists of items
 */
const VirtualizedGrid = ({ items, renderItem, columnCount = 12, rowHeight = 200 }) => {
    const getColumnWidth = useCallback(
        (width) => width / columnCount,
        [columnCount]
    );

    // Calculate how many rows we need based on item count and columns
    const rowCount = Math.ceil(items.length / columnCount);

    // Map from flat index to row/column coordinates
    const getItemKey = useCallback(
        ({ columnIndex, rowIndex }) => {
            const index = rowIndex * columnCount + columnIndex;
            return index < items.length ? items[index].id : `empty-${rowIndex}-${columnIndex}`;
        },
        [items, columnCount]
    );

    // Render cell
    const Cell = useCallback(
        ({ columnIndex, rowIndex, style }) => {
            const index = rowIndex * columnCount + columnIndex;

            // Return empty cell if index is out of bounds
            if (index >= items.length) {
                return <div style={style} />;
            }

            // Otherwise render the item
            return (
                <div style={style}>
                    {renderItem({ item: items[index], index })}
                </div>
            );
        },
        [items, columnCount, renderItem]
    );

    return (
        <AutoSizer disableWidth="">
            {({ height, width }) => (
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

VirtualizedGrid.propTypes = {
    items: PropTypes.array.isRequired,
    renderItem: PropTypes.func.isRequired,
    columnCount: PropTypes.number,
    rowHeight: PropTypes.number
};

export default React.memo(VirtualizedGrid);