import { ValidationError } from "../utils/errors.js";

export interface ReasonCode {
  id: number;
  category: string;
  label: string;
  active: boolean;
}

/**
 * A reason picked from the catalog takes the code's category and exact label, so the loss
 * ranking groups it with every other stop of that code. Free text stays allowed.
 */
export function applyReasonCode<
  T extends { category: string; reason?: string; codeId?: number | null },
>(input: T, code: ReasonCode | undefined) {
  if (input.codeId == null) {
    if (!input.reason?.trim())
      throw new ValidationError("Choose a listed reason or describe the stop");
    return { ...input, codeId: null, reason: input.reason.trim() };
  }
  if (!code || !code.active)
    throw new ValidationError("The chosen reason is no longer listed");
  return { ...input, category: code.category, reason: code.label };
}
