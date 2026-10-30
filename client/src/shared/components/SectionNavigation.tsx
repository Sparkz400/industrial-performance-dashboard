import React from 'react';
import { Box, MenuItem, Tab, Tabs, TextField } from '@mui/material';

/**
 *
 * @param root0
 * @param root0.label
 * @param root0.value
 * @param root0.onChange
 * @param root0.sections
 * @param root0.vertical
 */
export default function SectionNavigation({
  label,
  value,
  onChange,
  sections,
  vertical = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  sections: { label: string; value: number }[];
  vertical?: boolean;
}) {
  return (
    <Box sx={{ minWidth: 0, flexShrink: 0, width: vertical ? { xs: '100%', md: 210 } : '100%' }}>
      <TextField
        select
        fullWidth
        label={label}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        sx={{ display: { xs: 'flex', md: 'none' } }}
      >
        {sections.map((section) => (
          <MenuItem key={section.value} value={section.value}>
            {section.label}
          </MenuItem>
        ))}
      </TextField>
      <Tabs
        value={value}
        onChange={(_, next: number) => onChange(next)}
        aria-label={label}
        orientation={vertical ? 'vertical' : 'horizontal'}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          display: { xs: 'none', md: 'flex' },
          borderBottom: vertical ? 0 : 1,
          borderColor: 'divider',
          '& .MuiTab-root': { alignItems: vertical ? 'flex-start' : 'center' },
        }}
      >
        {sections.map((section) => (
          <Tab key={section.value} value={section.value} label={section.label} />
        ))}
      </Tabs>
    </Box>
  );
}
