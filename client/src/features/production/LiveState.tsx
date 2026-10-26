import React, { useEffect, useState } from 'react';
import { Stack, Typography } from '@mui/material';
import type { MachineLiveSummary } from '@performance-dashboard/shared';
import { useT } from '@/i18n';
/**
 *
 * @param machine
 * @param updatedAt
 * @param now
 * @param failed
 */
export function displayedState(
  machine: Pick<MachineLiveSummary, 'state' | 'freshness'>,
  updatedAt: number,
  now: number,
  failed: boolean,
) {
  return failed || now - updatedAt > 15000 || machine.freshness !== 'fresh'
    ? 'unknown'
    : machine.state;
}
/**
 *
 * @param root0
 * @param root0.machine
 * @param root0.updatedAt
 * @param root0.failed
 * @param root0.large
 */
export default function LiveState({
  machine,
  updatedAt,
  failed = false,
  large = false,
}: {
  machine: MachineLiveSummary;
  updatedAt: number;
  failed?: boolean;
  large?: boolean;
}) {
  const t = useT(),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const state = displayedState(machine, updatedAt, now, failed),
    stale = failed || now - updatedAt > 15000;
  const states = new Map(
    Object.entries({
      running: 'In Betrieb',
      idle: 'Leerlauf',
      fault: 'Störung',
      planned: 'Geplanter Stillstand',
      unknown: 'Unbekannt',
    }),
  );
  const freshness = new Map(
    Object.entries({
      fresh: 'Aktuell',
      stale: 'Veraltet',
      missing: 'Fehlend',
      'bad-quality': 'Ungültige Qualität',
      disconnected: 'Getrennt',
      'clock-skew': 'Uhrzeitabweichung',
    }),
  );
  return (
    <Stack aria-live="polite">
      <Typography
        variant={large ? 'h3' : 'h6'}
        color={
          state === 'unknown' ? 'warning.main' : state === 'fault' ? 'error.main' : 'text.primary'
        }
      >
        {t(state === 'unknown' ? 'Unknown' : state, states.get(state))}
      </Typography>
      <Typography variant="body2">
        {stale
          ? t('Display update overdue', 'Anzeigeaktualisierung überfällig')
          : t(machine.freshness, freshness.get(machine.freshness))}
      </Typography>
    </Stack>
  );
}
