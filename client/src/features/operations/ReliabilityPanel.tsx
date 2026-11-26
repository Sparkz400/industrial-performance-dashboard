import React, { useMemo, useState } from 'react';
import {
  Alert,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useT } from '@/i18n';
import { useAuthStore } from '@/stores/useAuthStore';
import { operationRequest } from './api';
import { hours } from '@/utils/insightFormat';

interface Reliability {
  failures: number;
  mtbfSeconds: number | null;
  mttrSeconds: number | null;
  complete: boolean;
  unknownSeconds?: number;
  profiled?: boolean;
}

/**
 * MTBF (running time per failure) and MTTR (fault time per failure) for the selected machine
 * and, for supervisors, every line.
 * @param root0
 * @param root0.machineId
 */
export default function ReliabilityPanel({ machineId }: { machineId: number }) {
  const t = useT();
  const supervisor = useAuthStore((s) => ['admin', 'supervisor'].includes(s.user?.role ?? ''));
  const [days, setDays] = useState(7);
  // Whole minutes keep the query key stable between renders.
  const range = useMemo(() => {
    const to = new Date(Math.floor(Date.now() / 60000) * 60000);
    return { from: new Date(+to - days * 86400000).toISOString(), to: to.toISOString() };
  }, [days]);
  const query = `from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
  const machine = useQuery({
    queryKey: ['reliability', machineId, range],
    queryFn: () =>
      operationRequest<Reliability>(`/production/machines/${machineId}/reliability?${query}`),
    enabled: machineId > 0,
  });
  const lines = useQuery({
    queryKey: ['line-reliability', range],
    queryFn: async () => {
      const list = await operationRequest<{ id: number; name: string }[]>('/lines');
      return Promise.all(
        list.map(async (line) => ({
          ...line,
          ...(
            await operationRequest<{ line: Reliability }>(`/lines/${line.id}/reliability?${query}`)
          ).line,
        })),
      );
    },
    enabled: supervisor,
  });
  const unknown = t('Unknown');
  const row = (name: string, r: Reliability) => (
    <TableRow key={name}>
      <TableCell>{name}</TableCell>
      <TableCell>{r.failures}</TableCell>
      <TableCell>{hours(r.mtbfSeconds, unknown)}</TableCell>
      <TableCell>{hours(r.mttrSeconds, unknown)}</TableCell>
      <TableCell>{r.complete ? t('Complete') : t('Gaps in data')}</TableCell>
    </TableRow>
  );
  return (
    <Stack spacing={2}>
      <Typography variant="h6">{t('Reliability (MTBF / MTTR)')}</Typography>
      <Typography variant="body2" color="text.secondary">
        {t(
          'MTBF is running time per failure; MTTR is fault time per failure. A failure counts only when its start was observed.',
        )}
      </Typography>
      <TextField
        select
        label={t('Period')}
        value={days}
        onChange={(e) => setDays(Number(e.target.value))}
        sx={{ maxWidth: 200 }}
      >
        <MenuItem value={7}>{t('Last 7 days')}</MenuItem>
        <MenuItem value={30}>{t('Last 30 days')}</MenuItem>
      </TextField>
      {(machine.error || lines.error) && (
        <Alert severity="error">{String((machine.error ?? lines.error) as Error)}</Alert>
      )}
      {machine.data?.profiled === false && (
        <Alert severity="info">
          {t('This machine has no commissioned state signal, so its reliability is unknown.')}
        </Alert>
      )}
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{t('Asset')}</TableCell>
            <TableCell>{t('Failures')}</TableCell>
            <TableCell>MTBF</TableCell>
            <TableCell>MTTR</TableCell>
            <TableCell>{t('Coverage')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {machine.data && row(t('Selected machine'), machine.data)}
          {lines.data?.map((line) => row(line.name, line))}
        </TableBody>
      </Table>
    </Stack>
  );
}
