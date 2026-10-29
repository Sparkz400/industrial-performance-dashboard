import type { OperatorEntry } from '@performance-dashboard/shared';

export const OFFLINE_DRAFT_KEY = 'pd-operator-drafts-v1';
export const OFFLINE_DRAFT_TTL = 24 * 60 * 60 * 1000;
export const OFFLINE_DRAFT_EVENT = 'operator-drafts-changed';
export type OperatorDraftForm = Record<
  | 'requestId'
  | 'kind'
  | 'text'
  | 'priority'
  | 'ownerId'
  | 'dueAt'
  | 'shiftId'
  | 'intervalStart'
  | 'intervalEnd'
  | 'total'
  | 'good'
  | 'reject'
  | 'manualState',
  string
>;
export type OfflineEntryBase = Pick<OperatorEntry, 'id' | 'version' | 'status' | 'kind'>;
export interface OfflineOperatorDraft {
  id: string;
  userId: number;
  machineId: number;
  createdAt: string;
  expiresAt: string;
  form: OperatorDraftForm;
  entry: OfflineEntryBase | null;
  status: 'open' | 'resolved';
}

/** Erase protected drafts before logout or account revocation completes. */
export function clearOfflineDrafts() {
  try {
    localStorage.removeItem(OFFLINE_DRAFT_KEY);
  } catch {
    /* Storage may be disabled. */
  }
  window.dispatchEvent(new Event(OFFLINE_DRAFT_EVENT));
}

/**
 * Read only this verified account's unexpired drafts.
 * @param userId Verified account identity.
 * @param now Current clock for expiry checks.
 */
export function readOfflineDrafts(userId: number, now = Date.now()): OfflineOperatorDraft[] {
  try {
    const raw = localStorage.getItem(OFFLINE_DRAFT_KEY);
    if (!raw) return [];
    if (raw.length > 200000) throw new Error('Draft storage limit');
    const state = JSON.parse(raw);
    if (state.userId !== userId || !Array.isArray(state.drafts) || state.drafts.length > 20)
      throw new Error('Draft owner or format changed');
    // Drafts kept before manual state declarations have no manualState field yet.
    for (const draft of state.drafts)
      if (draft?.form && Object.keys(draft.form).length === 12) draft.form.manualState ??= '';
    const drafts = state.drafts.filter(
      (draft: OfflineOperatorDraft) =>
        draft.userId === userId &&
        Number.isSafeInteger(draft.machineId) &&
        draft.machineId > 0 &&
        typeof draft.id === 'string' &&
        draft.id.length === 36 &&
        Number.isFinite(Date.parse(draft.createdAt)) &&
        Date.parse(draft.createdAt) <= now + 60000 &&
        Date.parse(draft.expiresAt) === Date.parse(draft.createdAt) + OFFLINE_DRAFT_TTL &&
        Date.parse(draft.expiresAt) > now &&
        ['open', 'resolved'].includes(draft.status) &&
        draft.form &&
        Object.keys(draft.form).length === 13 &&
        Object.values(draft.form).every(
          (value) => typeof value === 'string' && value.length <= 4000,
        ) &&
        ['note', 'action', 'quantity', 'state'].includes(draft.form.kind) &&
        (draft.entry === null ||
          (Number.isSafeInteger(draft.entry.id) &&
            draft.entry.id > 0 &&
            Number.isSafeInteger(draft.entry.version) &&
            draft.entry.version > 0)),
    );
    if (drafts.length !== state.drafts.length)
      localStorage.setItem(OFFLINE_DRAFT_KEY, JSON.stringify({ userId, drafts }));
    return drafts;
  } catch {
    clearOfflineDrafts();
    return [];
  }
}

/**
 * Retain an explicitly saved intent without submitting it.
 * @param draft Account-scoped draft with stable request identity.
 */
export function retainOfflineDraft(draft: OfflineOperatorDraft) {
  const drafts = readOfflineDrafts(draft.userId);
  if (drafts.length >= 20) throw new Error('Keep at most 20 drafts on this device');
  if (drafts.some((item) => item.id === draft.id))
    throw new Error('This draft is already retained');
  const serialized = JSON.stringify({ userId: draft.userId, drafts: [...drafts, draft] });
  if (serialized.length > 200000) throw new Error('Draft storage limit reached');
  localStorage.setItem(OFFLINE_DRAFT_KEY, serialized);
  window.dispatchEvent(new Event(OFFLINE_DRAFT_EVENT));
}

/**
 * Remove a submitted or explicitly discarded local copy.
 * @param userId Verified account identity.
 * @param id Stable intent identity.
 */
export function discardOfflineDraft(userId: number, id: string) {
  const drafts = readOfflineDrafts(userId).filter((draft) => draft.id !== id);
  localStorage.setItem(OFFLINE_DRAFT_KEY, JSON.stringify({ userId, drafts }));
  window.dispatchEvent(new Event(OFFLINE_DRAFT_EVENT));
}
