import React, { useState, useEffect } from 'react';
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import {
  signalUnits,
  type SignalUnit,
  type DerivedSignalDefinition,
  type DerivedEvaluation,
  type SignalExpression,
} from '@performance-dashboard/shared';
import { useT } from '@/i18n';
import { useAuthStore } from '@/stores/useAuthStore';
import { localInput, operationRequest, toIso } from './api';
type Input = {
  key: string;
  namespaceUri: string | null;
  identifier: string | null;
  dataType: string;
};
const describeExpression = (expression: SignalExpression): string => {
  if (expression.kind === 'input') return `${expression.key} [${expression.unit}]`;
  if (expression.kind === 'constant') return `${expression.value} [${expression.unit}]`;
  const operator =
    expression.kind === 'add'
      ? '+'
      : expression.kind === 'subtract'
        ? '−'
        : expression.kind === 'multiply'
          ? '×'
          : '÷';
  return `(${describeExpression(expression.left)} ${operator} ${describeExpression(expression.right)})`;
};
/**
 * Review immutable calculated definitions and their historical input evidence.
 * @param root0 Panel options.
 * @param root0.machineId Selected accessible machine.
 */
export default function DerivedSignalsPanel({ machineId }: { machineId: number }) {
  const t = useT(),
    canEdit = useAuthStore((s) => ['admin', 'supervisor'].includes(s.user?.role ?? ''));
  const query = useQuery({
    queryKey: ['derived-definitions', machineId],
    queryFn: () =>
      operationRequest<{ definitions: DerivedSignalDefinition[]; inputs: Input[] }>(
        `/derived-signals/machines/${machineId}`,
      ),
    enabled: !!machineId,
  });
  const [name, setName] = useState(''),
    [left, setLeft] = useState(''),
    [right, setRight] = useState('');
  const [leftUnit, setLeftUnit] = useState<SignalUnit>('1'),
    [rightUnit, setRightUnit] = useState<SignalUnit>('1');
  const [operator, setOperator] = useState<'add' | 'subtract' | 'multiply' | 'divide'>('divide'),
    [maxAge, setMaxAge] = useState(60);
  const [selected, setSelected] = useState(''),
    [start, setStart] = useState(localInput(new Date(Date.now() - 900000).toISOString())),
    [end, setEnd] = useState(localInput(new Date().toISOString()));
  const [result, setResult] = useState<DerivedEvaluation | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const [versions, setVersions] = useState<DerivedSignalDefinition[]>([]);
  useEffect(() => {
    setResult(null);
    setSelected('');
    setMessage('');
    setLeft('');
    setRight('');
    setName('');
    setVersions([]);
  }, [machineId]);
  const inputs = (query.data?.inputs ?? []).filter(
    (input) => input.namespaceUri && input.identifier,
  );
  const definitions = query.data?.definitions ?? [];
  const existing = definitions.find((def) => def.name === name.trim());
  const selectedDefinition = [...definitions, ...versions].find(
    (definition) => String(definition.id) === selected,
  );
  const loadVersions = async () => {
    const definition = [...definitions, ...versions].find((item) => String(item.id) === selected);
    if (!definition) return;
    setBusy(true);
    try {
      const response = await operationRequest<{ definitions: DerivedSignalDefinition[] }>(
        `/derived-signals/machines/${machineId}?${new URLSearchParams({ name: definition.name })}`,
      );
      setVersions(response.definitions);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    setMessage('');
    try {
      const leaf = (key: string, unit: SignalUnit): SignalExpression => {
        const input = inputs.find((item) => item.key === key);
        if (!input)
          throw new Error(t('Select both measured inputs', 'Beide gemessenen Eingänge auswählen'));
        return {
          kind: 'input',
          key,
          unit,
          namespaceUri: input.namespaceUri!,
          identifier: input.identifier!,
        };
      };
      const saved = await operationRequest<DerivedSignalDefinition>(
        `/derived-signals/machines/${machineId}`,
        'POST',
        {
          name,
          expectedVersion: existing?.version ?? 0,
          expression: {
            expression: {
              kind: operator,
              left: leaf(left, leftUnit),
              right: leaf(right, rightUnit),
            },
            maxAgeSeconds: maxAge,
          },
        },
      );
      await query.refetch();
      setSelected(String(saved.id));
      setResult(null);
      setMessage(
        t(
          'Definition saved as a new immutable version.',
          'Definition als neue unveränderliche Version gespeichert.',
        ),
      );
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  };
  const evaluate = async () => {
    setBusy(true);
    setMessage('');
    setResult(null);
    try {
      const params = new URLSearchParams({ start: toIso(start), end: toIso(end) });
      setResult(
        await operationRequest<DerivedEvaluation>(
          `/derived-signals/machines/${machineId}/${selected}/evaluate?${params}`,
        ),
      );
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  };
  const exportEvidence = () => {
    if (!result) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `calculated-signal-${result.definition.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Stack spacing={2}>
      <Typography component="h2" variant="h5">
        {t('Calculated signals', 'Berechnete Signale')}
      </Typography>
      <Alert severity="info">
        {t(
          'Calculated values retain input quality and source identity. Units are declarations to verify against the source. Missing or stale inputs never become zero.',
          'Berechnete Werte behalten Eingangsqualität und Quellenidentität. Einheiten müssen an der Quelle geprüft werden. Fehlende oder veraltete Eingänge werden nie zu null.',
        )}
      </Alert>
      {query.error && <Alert severity="error">{String(query.error)}</Alert>}
      {canEdit && (
        <Stack
          spacing={2}
          component="section"
          aria-label={t('Define a calculation', 'Berechnung definieren')}
        >
          <TextField
            label={t('Calculation name', 'Berechnungsname')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            inputProps={{ maxLength: 100 }}
          />
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              select
              fullWidth
              label={t('First input', 'Erster Eingang')}
              value={left}
              onChange={(e) => setLeft(e.target.value)}
            >
              {inputs.map((input) => (
                <MenuItem key={input.key} value={input.key}>
                  {input.key}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              fullWidth
              label={t('First input unit', 'Einheit erster Eingang')}
              value={leftUnit}
              onChange={(e) => setLeftUnit(e.target.value as SignalUnit)}
            >
              {signalUnits.map((unit) => (
                <MenuItem key={unit} value={unit}>
                  {unit}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              fullWidth
              label={t('Operation', 'Rechenart')}
              value={operator}
              onChange={(e) => setOperator(e.target.value as typeof operator)}
            >
              <MenuItem value="divide">÷</MenuItem>
              <MenuItem value="multiply">×</MenuItem>
              <MenuItem value="add">+</MenuItem>
              <MenuItem value="subtract">−</MenuItem>
            </TextField>
            <TextField
              select
              fullWidth
              label={t('Second input', 'Zweiter Eingang')}
              value={right}
              onChange={(e) => setRight(e.target.value)}
            >
              {inputs.map((input) => (
                <MenuItem key={input.key} value={input.key}>
                  {input.key}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              fullWidth
              label={t('Second input unit', 'Einheit zweiter Eingang')}
              value={rightUnit}
              onChange={(e) => setRightUnit(e.target.value as SignalUnit)}
            >
              {signalUnits.map((unit) => (
                <MenuItem key={unit} value={unit}>
                  {unit}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField
            label={t('Maximum input age (seconds)', 'Maximales Eingangsalter (Sekunden)')}
            type="number"
            value={maxAge}
            onChange={(e) => setMaxAge(Number(e.target.value))}
            inputProps={{ min: 1, max: 3600 }}
          />
          {existing && (
            <Alert severity="warning">
              {t(
                'Saving creates a new version; previous definitions remain unchanged.',
                'Speichern erstellt eine neue Version; frühere Definitionen bleiben unverändert.',
              )}{' '}
              v{existing.version} → v{existing.version + 1}
            </Alert>
          )}
          <Button
            variant="contained"
            disabled={busy || !name.trim() || !left || !right}
            onClick={() => void save()}
          >
            {t('Save reviewed definition', 'Geprüfte Definition speichern')}
          </Button>
        </Stack>
      )}
      {message && (
        <Alert severity="info" role="status">
          {message}
        </Alert>
      )}
      <TextField
        select
        label={t('Saved calculation', 'Gespeicherte Berechnung')}
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value);
          setResult(null);
          if (!versions.some((version) => String(version.id) === e.target.value)) setVersions([]);
        }}
      >
        {[
          ...definitions,
          ...versions.filter((version) => !definitions.some((def) => def.id === version.id)),
        ].map((def) => (
          <MenuItem key={def.id} value={String(def.id)}>
            {def.name} · v{def.version}
          </MenuItem>
        ))}
      </TextField>
      {selectedDefinition && (
        <Typography sx={{ overflowWrap: 'anywhere' }}>
          {t('Saved expression', 'Gespeicherte Berechnung')}:{' '}
          {describeExpression(selectedDefinition.expression.expression)} ·{' '}
          {t('Maximum age', 'Maximalalter')}: {selectedDefinition.expression.maxAgeSeconds}s
        </Typography>
      )}
      <Button disabled={!selected || busy} onClick={() => void loadVersions()}>
        {t('Show previous definition versions', 'Frühere Definitionsversionen anzeigen')}
      </Button>
      {versions.length > 0 && (
        <TextField
          select
          label={t('Definition version (latest 100)', 'Definitionsversion (letzte 100)')}
          value={selected}
          onChange={(event) => {
            setSelected(event.target.value);
            setResult(null);
          }}
        >
          {versions.map((definition) => (
            <MenuItem key={definition.id} value={String(definition.id)}>
              {definition.name} · v{definition.version} ·{' '}
              {new Date(definition.createdAt).toLocaleString()}
            </MenuItem>
          ))}
        </TextField>
      )}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          fullWidth
          type="datetime-local"
          label={t('Start', 'Beginn')}
          value={start}
          onChange={(e) => setStart(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          fullWidth
          type="datetime-local"
          label={t('End', 'Ende')}
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <Button disabled={!selected || busy} onClick={() => void evaluate()}>
          {t('Evaluate history', 'Verlauf berechnen')}
        </Button>
      </Stack>
      {result && (
        <Stack spacing={1}>
          <Typography role="status">
            {t('At selected end', 'Am gewählten Ende')}:{' '}
            {result.current.value == null
              ? t('Unknown', 'Unbekannt')
              : result.current.value.toPrecision(6)}{' '}
            {result.current.unit}
          </Typography>
          <Typography>{result.current.reasons.join('; ')}</Typography>
          <Typography variant="caption">
            {t('Definition', 'Definition')}: {result.definition.name} v{result.definition.version} ·{' '}
            {result.sampleCount} {t('source samples', 'Quellmessungen')}
          </Typography>
          <Button onClick={exportEvidence}>
            {t('Export calculation evidence', 'Berechnungsnachweis exportieren')}
          </Button>
          <Typography variant="caption">
            {t(
              'Showing the last 100 changes and expiry boundaries; export retains all points and raw input evidence.',
              'Die letzten 100 Änderungen und Ablaufgrenzen werden angezeigt; der Export enthält alle Punkte und Rohdaten.',
            )}
          </Typography>
          <Box
            sx={{ overflowX: 'auto', maxWidth: '100%' }}
            tabIndex={0}
            role="region"
            aria-label={t('Calculation history', 'Berechnungsverlauf')}
          >
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('Time', 'Zeit')}</TableCell>
                  <TableCell>{t('Value', 'Wert')}</TableCell>
                  <TableCell>{t('Quality / reason', 'Qualität / Grund')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.points.slice(-100).map((point) => (
                  <TableRow key={point.timestamp}>
                    <TableCell>{new Date(point.timestamp).toLocaleString()}</TableCell>
                    <TableCell>
                      {point.value == null ? t('Unknown', 'Unbekannt') : point.value.toPrecision(6)}
                    </TableCell>
                    <TableCell>{point.reasons.join('; ') || t('Good', 'Gut')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Stack>
      )}
    </Stack>
  );
}
