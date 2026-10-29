import { beforeEach, describe, expect, it } from 'vitest';
import {
  OFFLINE_DRAFT_KEY,
  OFFLINE_DRAFT_TTL,
  clearOfflineDrafts,
  readOfflineDrafts,
  retainOfflineDraft,
  discardOfflineDraft,
  type OfflineOperatorDraft,
} from './offlineDrafts';

const draft = (userId = 1): OfflineOperatorDraft => {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    userId,
    machineId: 4,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + OFFLINE_DRAFT_TTL).toISOString(),
    entry: null,
    status: 'open',
    form: {
      requestId: crypto.randomUUID(),
      kind: 'note',
      text: 'Inspect belt',
      priority: 'normal',
      ownerId: '',
      dueAt: '',
      shiftId: '',
      intervalStart: '',
      intervalEnd: '',
      total: '',
      good: '',
      reject: '',
      manualState: '',
    },
  };
};

describe('offline operator drafts', () => {
  beforeEach(() => localStorage.clear());
  it('retains distinct intents and removes only the acknowledged local copy', () => {
    const a = draft(),
      b = draft();
    retainOfflineDraft(a);
    retainOfflineDraft(b);
    expect(readOfflineDrafts(1).map((item) => item.id)).toEqual([a.id, b.id]);
    expect(() => retainOfflineDraft(a)).toThrow('already retained');
    discardOfflineDraft(1, a.id);
    expect(readOfflineDrafts(1).map((item) => item.id)).toEqual([b.id]);
  });
  it('purges protected drafts on account change and explicit logout', () => {
    retainOfflineDraft(draft());
    expect(readOfflineDrafts(2)).toEqual([]);
    expect(localStorage.getItem(OFFLINE_DRAFT_KEY)).toBeNull();
    retainOfflineDraft(draft(2));
    clearOfflineDrafts();
    expect(readOfflineDrafts(2)).toEqual([]);
  });
  it('expires drafts exactly at their boundary and rejects altered expiry/future clocks', () => {
    const item = draft();
    retainOfflineDraft(item);
    expect(readOfflineDrafts(1, Date.parse(item.expiresAt) - 1)).toHaveLength(1);
    expect(readOfflineDrafts(1, Date.parse(item.expiresAt))).toEqual([]);
    for (const changed of [
      { ...item, expiresAt: new Date(Date.parse(item.expiresAt) + 1).toISOString() },
      { ...item, createdAt: new Date(Date.now() + 120000).toISOString() },
    ]) {
      localStorage.setItem(OFFLINE_DRAFT_KEY, JSON.stringify({ userId: 1, drafts: [changed] }));
      expect(readOfflineDrafts(1)).toEqual([]);
    }
  });
  it('keeps drafts saved before manual state declarations existed', () => {
    const item = draft();
    const { manualState: _added, ...form } = item.form;
    localStorage.setItem(
      OFFLINE_DRAFT_KEY,
      JSON.stringify({ userId: 1, drafts: [{ ...item, form }] }),
    );
    expect(readOfflineDrafts(1).map((kept) => [kept.id, kept.form.manualState])).toEqual([
      [item.id, ''],
    ]);
  });
  it('bounds stored drafts and discards corrupt state', () => {
    for (let i = 0; i < 20; i++) retainOfflineDraft(draft());
    expect(() => retainOfflineDraft(draft())).toThrow('20 drafts');
    localStorage.setItem(OFFLINE_DRAFT_KEY, '{bad');
    expect(readOfflineDrafts(1)).toEqual([]);
  });
});
