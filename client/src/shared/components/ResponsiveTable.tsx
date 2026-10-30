import React from 'react';
import { Table, type TableProps } from '@mui/material';
import { useT } from '@/i18n';

// Administration rows keep every field and action on phones, with visible field labels.
/**
 *
 * @param root0
 * @param root0.labels
 * @param root0.sx
 */
export default function ResponsiveTable({
  labels,
  sx,
  ...props
}: TableProps & { labels: string[] }) {
  const t = useT();
  return (
    <Table
      {...props}
      role="table"
      sx={[
        {
          '@media (max-width:599px)': {
            display: 'block',
            width: '100%',
            minWidth: 0,
            '& thead': {
              position: 'absolute',
              width: '1px',
              height: '1px',
              overflow: 'hidden',
              clipPath: 'inset(50%)',
            },
            '& tbody': { display: 'block' },
            '& tbody tr': { display: 'block', borderBottom: 1, borderColor: 'divider', py: 1 },
            '& tbody td': {
              display: 'flex',
              flexWrap: 'wrap',
              gap: 1,
              justifyContent: 'space-between',
              alignItems: 'center',
              border: 0,
              textAlign: 'left',
              minWidth: 0,
              overflowWrap: 'anywhere',
              py: 1,
            },
            ...Object.fromEntries(
              labels.map((label, index) => [
                `& tbody td:nth-of-type(${index + 1}):not([colspan])::before`,
                {
                  content: JSON.stringify(t(label)),
                  color: 'text.secondary',
                  fontSize: '0.8rem',
                  marginRight: 'auto',
                },
              ]),
            ),
          },
        },
        ...(Array.isArray(sx) ? sx : [sx ?? {}]),
      ]}
    />
  );
}
