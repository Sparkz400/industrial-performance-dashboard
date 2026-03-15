import React, { useState, useMemo, useCallback, memo } from 'react';
import { Typography, ToggleButton, ToggleButtonGroup, Box, useTheme } from '@mui/material';
import { ResponsivePie } from '@nivo/pie';

interface PieDataItem {
  id: string;
  label: string;
  value: number;
  color: string;
}

type ViewType = 'today' | 'total';

const COLORS: string[] = ['#6e6e70', '#ea2e2e', '#61503d', '#00C49F', '#90aa74', '#41af48'];

const generateDummyPieDataToday = (): PieDataItem[] => [
  { id: 'Off', label: 'Off', value: 5, color: COLORS[0] },
  { id: 'Error State', label: 'Error State', value: 5, color: COLORS[1] },
  { id: 'Setup Mode', label: 'Setup Mode', value: 10, color: COLORS[2] },
  { id: 'Auto (Not Started)', label: 'Auto (Not Started)', value: 20, color: COLORS[3] },
  { id: 'Auto (Idle)', label: 'Auto (Started & Idle)', value: 30, color: COLORS[4] },
  { id: 'Auto (Production)', label: 'Auto (In Production)', value: 30, color: COLORS[5] },
];

const generateDummyPieDataTotal = (): PieDataItem[] => [
  { id: 'Off', label: 'Off', value: 10, color: COLORS[0] },
  { id: 'Error State', label: 'Error State', value: 5, color: COLORS[1] },
  { id: 'Setup Mode', label: 'Setup Mode', value: 15, color: COLORS[2] },
  { id: 'Auto (Not Started)', label: 'Auto (Not Started)', value: 20, color: COLORS[3] },
  { id: 'Auto (Idle)', label: 'Auto (Started & Idle)', value: 25, color: COLORS[4] },
  { id: 'Auto (Production)', label: 'Auto (In Production)', value: 25, color: COLORS[5] },
];

const TODAY_DATA: PieDataItem[] = generateDummyPieDataToday();
const TOTAL_DATA: PieDataItem[] = generateDummyPieDataTotal();

const OperationModePieWidget = memo(() => {
  const [view, setView] = useState<ViewType>('total');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const handleViewChange = useCallback(
    (_event: React.MouseEvent<HTMLElement>, newView: ViewType | null) => {
      if (newView !== null) setView(newView);
    },
    [],
  );

  const data = useMemo((): PieDataItem[] => (view === 'today' ? TODAY_DATA : TOTAL_DATA), [view]);

  const nivoTheme = useMemo(
    () => ({
      text: { fill: isDark ? '#9DA3B4' : '#6B7280' },
      labels: { text: { fill: isDark ? '#E8E8ED' : '#1A1A2E', fontSize: 11, fontWeight: 600 } },
      tooltip: {
        container: {
          background: isDark ? '#1E2130' : '#ffffff',
          color: isDark ? '#E8E8ED' : '#1A1A2E',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          fontSize: '12px',
        },
      },
    }),
    [isDark],
  );

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Operation Mode Distribution
      </Typography>
      <ToggleButtonGroup
        value={view}
        exclusive
        onChange={handleViewChange}
        size="small"
        sx={{
          mb: 1,
          '& .MuiToggleButton-root': { borderRadius: '8px', px: 2, fontSize: '0.75rem' },
        }}
      >
        <ToggleButton className="no-drag" value="today">
          Today
        </ToggleButton>
        <ToggleButton className="no-drag" value="total">
          Total
        </ToggleButton>
      </ToggleButtonGroup>
      <Box sx={{ flexGrow: 1, minHeight: 0 }}>
        <ResponsivePie
          data={data}
          theme={nivoTheme}
          margin={{ top: 20, right: 80, bottom: 40, left: 80 }}
          innerRadius={0.5}
          padAngle={2}
          cornerRadius={6}
          activeOuterRadiusOffset={8}
          colors={{ datum: 'data.color' }}
          borderWidth={0}
          enableArcLabels={true}
          arcLabelsSkipAngle={15}
          arcLabelsTextColor={{ from: 'color', modifiers: [['brighter', 3]] }}
          enableArcLinkLabels={true}
          arcLinkLabelsSkipAngle={10}
          arcLinkLabelsTextColor={isDark ? '#9DA3B4' : '#6B7280'}
          arcLinkLabelsThickness={1}
          arcLinkLabelsColor={{ from: 'color' }}
          arcLinkLabelsDiagonalLength={12}
          arcLinkLabelsStraightLength={8}
          valueFormat={(v: number) => `${v}%`}
          animate={true}
          motionConfig="gentle"
          transitionMode="middleAngle"
        />
      </Box>
      <Typography variant="caption" color="text.secondary">
        Distribution for {view === 'today' ? 'today' : 'the entire operating period'}.
      </Typography>
    </Box>
  );
});

OperationModePieWidget.displayName = 'OperationModePieWidget';

export default OperationModePieWidget;
