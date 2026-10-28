import { createHash } from "node:crypto";
import { canonicalJson } from "../utils/canonicalJson.js";
import { ValidationError } from "../utils/errors.js";

export const OFFLINE_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function validateOfflineDraft(draftedAt?: string, now = Date.now()) {
  if (draftedAt === undefined) return;
  const created = Date.parse(draftedAt);
  if (!Number.isFinite(created) || created > now + 60000)
    throw new ValidationError("Offline draft time is invalid or in the future");
  if (now - created >= OFFLINE_DRAFT_MAX_AGE_MS)
    throw new ValidationError(
      "Offline draft expired; review and create a new draft",
    );
}

export function offlineIntentDigest(body: unknown) {
  return createHash("sha256").update(canonicalJson(body)).digest("hex");
}
