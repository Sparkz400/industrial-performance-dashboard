import { translate as t, useLanguage } from '@/i18n';
/* eslint-disable security/detect-object-injection -- Dynamic keys below come from fixed field/role lists; imported profiles are validated by the API. */
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { ProductionProfile, ProductionSignal } from '@performance-dashboard/shared';
import { Link } from 'react-router-dom';
import MachineForm from '@/features/machines/components/MachineForm';
import { useMachineStore } from '@/stores/useMachineStore';
import { API_BASE_URL } from '@/config/config';
import protectedFetch from '@/utils/protectedFetch';

/**
 *
 * @param path
 * @param body
 */
export async function productionRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await protectedFetch(
    `${API_BASE_URL}/production${path}`,
    body === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? data.error ?? 'Request failed');
  return data;
}
/**
 *
 * @param value
 * @param name
 */
export function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

const roles = ['state', 'total', 'good', 'reject'] as const;
const emptySignal = (nodeKey: string): ProductionSignal => ({
  nodeKey,
  namespaceUri: '',
  identifier: `s=${nodeKey}`,
  dataType: 'Int32',
  unit: null,
  scale: 1,
});
const initial: ProductionProfile = {
  version: 1,
  name: 'Production line',
  endpointModel: 'Owned simulator v1',
  signals: {
    state: emptySignal('ProductionState'),
    total: emptySignal('ProductionCount'),
    good: emptySignal('GoodCount'),
    reject: emptySignal('RejectCount'),
  },
  states: { running: [1], idle: [0], fault: [2], planned: [3] },
  idealCycleMs: 2000,
  maxGapSeconds: 20,
  counterPolicy: 'reject-decrease',
};
interface Preview {
  ready: boolean;
  namespaces: string[];
  identity: string;
  securityMode: string;
  trust: string;
  currentMappings: { nodeKey: string; nodeId: string }[];
  signals: {
    role: string;
    nodeKey: string;
    nodeId: string;
    quality: string;
    value: unknown;
    actualType: string;
    sourceTime: string | null;
    good: boolean;
  }[];
  checkedAt: string;
}

/**
 *
 */
export default function CommissioningPanel() {
  useLanguage((s) => s.language);
  const machines = useMachineStore((s) => s.machines);
  const fetchMachines = useMachineStore((s) => s.fetchMachines);
  const addMachine = useMachineStore((s) => s.addMachine);
  const [machineId, setMachineId] = useState('');
  const [profile, setProfile] = useState<ProductionProfile>(initial);
  const [stateText, setStateText] = useState(
    Object.fromEntries(
      Object.entries(initial.states).map(([key, values]) => [key, values.join(',')]),
    ),
  );
  const replaceProfile = (value: ProductionProfile) => {
    setProfile(value);
    setStateText(
      Object.fromEntries(
        Object.entries(value.states).map(([key, values]) => [key, values.join(',')]),
      ),
    );
    setReviewed(false);
  };
  const [showMachine, setShowMachine] = useState(false);
  const [preview, setPreview] = useState<Preview>();
  const [previewKey, setPreviewKey] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<{ dashboardId: string; connection: string }>();
  const [profiles, setProfiles] = useState<{ id: number; profile: ProductionProfile }[]>([]);
  useEffect(() => {
    void fetchMachines();
    void productionRequest<typeof profiles>('/profiles')
      .then(setProfiles)
      .catch((e) => setError(String(e)));
  }, [fetchMachines]);
  const key = JSON.stringify([machineId, profile]);
  const changeSignal = (role: (typeof roles)[number], patch: Partial<ProductionSignal>) =>
    setProfile((p) => ({
      ...p,
      signals: { ...p.signals, [role]: { ...(p.signals[role] ?? emptySignal(role)), ...patch } },
    }));
  /**
   *
   * @param withProfile
   */
  async function inspect(withProfile: boolean) {
    setBusy(true);
    setError('');
    setReviewed(false);
    setSaved(undefined);
    try {
      const result = await productionRequest<Preview>(
        `/machines/${machineId}/inspect`,
        withProfile ? { profile } : {},
      );
      setPreview(result);
      setPreviewKey(withProfile ? key : '');
    } catch (e) {
      setError(String(e));
      setPreview(undefined);
    } finally {
      setBusy(false);
    }
  }
  /**
   *
   */
  async function save() {
    setBusy(true);
    setError('');
    try {
      setSaved(await productionRequest(`/machines/${machineId}/commission`, { profile, reviewed }));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Stack spacing={2}>
      <Typography variant="h5">{t('Commission a machine')} </Typography>
      <Alert severity="info">
        {t(
          'This flow only reads the selected endpoint using its saved machine identity. Verify permissions, certificate trust and machine-specific meanings before using production equipment.',
        )}{' '}
      </Alert>
      {error && <Alert severity="error">{error}</Alert>}
      <Typography variant="h6">{t('1. Select and check the endpoint')} </Typography>
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        <TextField
          select
          label={t('Machine to commission')}
          value={machineId}
          onChange={(e) => {
            setMachineId(e.target.value);
            setPreview(undefined);
            setReviewed(false);
          }}
          sx={{ minWidth: 250 }}
        >
          {machines.map((machine) => (
            <MenuItem key={machine.id} value={machine.id}>
              {machine.name}
            </MenuItem>
          ))}
        </TextField>
        <Button onClick={() => setShowMachine(true)}>{t('Add machine')} </Button>
        <Button disabled={!machineId || busy} onClick={() => void inspect(false)}>
          {t('Check connection')}{' '}
        </Button>
      </Stack>
      <MachineForm
        open={showMachine}
        onClose={() => setShowMachine(false)}
        onSubmit={async (data) => {
          const machine = await addMachine({ ...data, isActive: false });
          setMachineId(String(machine.id));
          setShowMachine(false);
        }}
      />
      {preview && (
        <>
          <Alert severity="info">
            {t('Connected using')} {preview.identity}, {preview.securityMode}. {preview.trust}
            {t('. Checked')} {new Date(preview.checkedAt).toLocaleString()}.
          </Alert>
          <Button
            onClick={() =>
              downloadJson(
                {
                  format: 'commissioning-diagnostics-v1',
                  checkedAt: preview.checkedAt,
                  identity: preview.identity,
                  securityMode: preview.securityMode,
                  trust: preview.trust,
                  ready: preview.ready,
                  signals: preview.signals.map(
                    ({ role, quality, actualType, sourceTime, good }) => ({
                      role,
                      quality,
                      actualType,
                      sourceTime,
                      good,
                    }),
                  ),
                  redacted: [
                    'endpoint',
                    'machine name',
                    'node identifiers',
                    'namespace URIs',
                    'values',
                    'credentials',
                  ],
                },
                'commissioning-diagnostics.json',
              )
            }
          >
            {t('Download redacted diagnostics')}{' '}
          </Button>
        </>
      )}
      <Typography variant="h6">{t('2. Map the signals and their meaning')} </Typography>
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        <TextField
          label={t('Profile name')}
          value={profile.name}
          onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
        />
        <TextField
          label={t('Machine model / supported version')}
          value={profile.endpointModel}
          onChange={(e) => setProfile((p) => ({ ...p, endpointModel: e.target.value }))}
        />
        <TextField
          select
          label={t('Reuse a saved profile')}
          value=""
          sx={{ minWidth: 230 }}
          onChange={(e) => {
            replaceProfile(profiles.find((p) => p.id === Number(e.target.value))!.profile);
            setReviewed(false);
          }}
        >
          {profiles.map((p) => (
            <MenuItem value={p.id} key={p.id}>
              {p.profile.name} {t('· revision')} {p.id}
            </MenuItem>
          ))}
        </TextField>
        <Button
          disabled={!preview?.namespaces[1]}
          onClick={() =>
            replaceProfile({
              ...initial,
              signals: Object.fromEntries(
                roles.map((role) => [
                  role,
                  { ...initial.signals[role], namespaceUri: preview!.namespaces[1] },
                ]),
              ) as ProductionProfile['signals'],
            })
          }
        >
          {t('Use owned simulator example')}{' '}
        </Button>
      </Stack>
      <Typography variant="body2">
        {t('Available namespaces:')}{' '}
        {preview?.namespaces.join(' · ') ?? 'Check the connection first'}
        {t('. Importing a profile previews fields here; it does not change the machine.')}{' '}
      </Typography>
      {roles.map((role) => (
        <Box key={role} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
          <Typography fontWeight="bold" sx={{ mb: 1 }}>
            {role === 'state' ? t('Machine state') : `${role} counter`}
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={1}>
            <TextField
              size="small"
              label={`${role} key`}
              value={profile.signals[role]?.nodeKey ?? ''}
              onChange={(e) => changeSignal(role, { nodeKey: e.target.value })}
            />
            <TextField
              size="small"
              label={`${role} namespace URI`}
              value={profile.signals[role]?.namespaceUri ?? ''}
              onChange={(e) => changeSignal(role, { namespaceUri: e.target.value })}
              sx={{ minWidth: 250 }}
            />
            <TextField
              size="small"
              label={`${role} identifier`}
              value={profile.signals[role]?.identifier ?? ''}
              onChange={(e) => changeSignal(role, { identifier: e.target.value })}
            />
            <TextField
              size="small"
              label={`${role} type`}
              value={profile.signals[role]?.dataType ?? ''}
              onChange={(e) => changeSignal(role, { dataType: e.target.value })}
            />
            <TextField
              size="small"
              label={`${role} unit`}
              value={profile.signals[role]?.unit ?? ''}
              onChange={(e) => changeSignal(role, { unit: e.target.value || null })}
            />
            <TextField
              size="small"
              type="number"
              label={`${role} scale`}
              value={profile.signals[role]?.scale ?? 1}
              onChange={(e) => changeSignal(role, { scale: Number(e.target.value) })}
            />
          </Stack>
        </Box>
      ))}
      <Stack direction="row" flexWrap="wrap" gap={2}>
        {(['running', 'idle', 'fault', 'planned'] as const).map((state) => (
          <TextField
            key={state}
            label={`${state} values (comma separated)`}
            value={stateText[state]}
            onChange={(e) => {
              const text = e.target.value;
              setStateText((previous) => ({ ...previous, [state]: text }));
              setProfile((p) => ({
                ...p,
                states: {
                  ...p.states,
                  [state]: text
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean)
                    .map(Number),
                },
              }));
            }}
          />
        ))}
        <TextField
          label={t('Ideal cycle (milliseconds)')}
          type="number"
          value={profile.idealCycleMs}
          onChange={(e) => setProfile((p) => ({ ...p, idealCycleMs: Number(e.target.value) }))}
        />
        <TextField
          label={t('Unknown after (seconds)')}
          type="number"
          value={profile.maxGapSeconds}
          onChange={(e) => setProfile((p) => ({ ...p, maxGapSeconds: Number(e.target.value) }))}
        />
        <TextField
          select
          label={t('Counter decreases')}
          value={profile.counterPolicy}
          onChange={(e) =>
            setProfile((p) => ({
              ...p,
              counterPolicy: e.target.value as ProductionProfile['counterPolicy'],
              counterModulus:
                e.target.value === 'rollover' ? (p.counterModulus ?? 65536) : undefined,
            }))
          }
        >
          <MenuItem value="reject-decrease">{t('Mark as incomplete')} </MenuItem>
          <MenuItem value="reset-to-zero">{t('Declared reset to zero')} </MenuItem>
          <MenuItem value="rollover">{t('Declared counter rollover')} </MenuItem>
        </TextField>
      </Stack>
      <Stack direction="row" spacing={2}>
        <Button onClick={() => downloadJson(profile, 'machine-profile.json')}>
          {t('Export profile')}{' '}
        </Button>
        <Button component="label">
          {t('Import profile')}{' '}
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                if (file.size > 65536) throw new Error('Profile exceeds 64 KB');
                const value = JSON.parse(await file.text());
                if (value.version !== 1 || !value.signals?.state || !value.states)
                  throw new Error('Invalid profile format');
                replaceProfile(
                  await productionRequest<ProductionProfile>('/profiles/validate', {
                    profile: value,
                  }),
                );
                setReviewed(false);
              } catch (error) {
                setError(String(error));
              }
            }}
          />
        </Button>
      </Stack>
      <Typography variant="h6">{t('3. Preview, review and save')} </Typography>
      <Button variant="outlined" disabled={!machineId || busy} onClick={() => void inspect(true)}>
        {t('Preview mapped signals')}{' '}
      </Button>
      {preview?.signals.map((signal) => (
        <Alert key={signal.role} severity={signal.good ? 'success' : 'warning'}>
          {signal.role}: {signal.nodeId} → {String(signal.value)} · {signal.quality} ·{' '}
          {signal.actualType} {t('· source')} {signal.sourceTime ?? 'unknown'}
        </Alert>
      ))}
      {preview && (
        <Typography variant="body2">
          {t('Existing mappings:')}{' '}
          {preview.currentMappings.map((m) => `${m.nodeKey} → ${m.nodeId}`).join('; ') || 'none'}
          {t('. Saving adds or updates the reviewed mappings and preserves other signals.')}{' '}
        </Typography>
      )}
      <FormControlLabel
        control={<Checkbox checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />}
        label={t(
          'I reviewed the mappings, state meanings, units and counter policy for this machine.',
        )}
      />
      <Button
        variant="contained"
        disabled={busy || !reviewed || !preview?.ready || previewKey !== key}
        onClick={() => void save()}
      >
        {t('Save profile and create dashboard')}{' '}
      </Button>
      {saved && (
        <Alert severity="success">
          {t('Profile saved. Connection:')} {saved.connection}.{' '}
          <Button component={Link} to={`/dashboard/${saved.dashboardId}`}>
            {t('Open machine dashboard')}{' '}
          </Button>
        </Alert>
      )}
    </Stack>
  );
}
