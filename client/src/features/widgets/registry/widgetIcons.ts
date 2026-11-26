import type React from 'react';
import type { SvgIconProps } from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ExtensionIcon from '@mui/icons-material/Extension';
import InsightsIcon from '@mui/icons-material/Insights';
import NotificationsIcon from '@mui/icons-material/Notifications';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import PieChartIcon from '@mui/icons-material/PieChart';
import ScienceIcon from '@mui/icons-material/Science';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import SpeedIcon from '@mui/icons-material/Speed';
import TimelineIcon from '@mui/icons-material/Timeline';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ViewInArIcon from '@mui/icons-material/ViewInAr';

// Only the icons the widget registry names: `import * as MuiIcons` shipped all ~2000 icons.
export const WIDGET_ICONS = new Map<string, React.ComponentType<SvgIconProps>>([
  ['AccessTime', AccessTimeIcon],
  ['Dashboard', DashboardIcon],
  ['Extension', ExtensionIcon],
  ['Insights', InsightsIcon],
  ['Notifications', NotificationsIcon],
  ['NotificationsActive', NotificationsActiveIcon],
  ['PieChart', PieChartIcon],
  ['Science', ScienceIcon],
  ['ShowChart', ShowChartIcon],
  ['Speed', SpeedIcon],
  ['Timeline', TimelineIcon],
  ['TrendingUp', TrendingUpIcon],
  ['ViewInAr', ViewInArIcon],
]);
