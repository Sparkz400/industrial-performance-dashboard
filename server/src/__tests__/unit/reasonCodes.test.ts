import { expect, it } from "vitest";
import { applyReasonCode } from "../../services/reasonCodes.js";

const code = {
  id: 4,
  category: "unplanned",
  label: "Jam at infeed",
  active: true,
};

it("copies a listed code's category and exact label", () => {
  expect(
    applyReasonCode(
      { category: "planned", reason: "jam infeed ", codeId: 4 },
      code,
    ),
  ).toMatchObject({
    category: "unplanned",
    reason: "Jam at infeed",
    codeId: 4,
  });
});

it("keeps free text when no code is chosen", () => {
  expect(
    applyReasonCode({ category: "planned", reason: " Lunch " }, undefined),
  ).toEqual({
    category: "planned",
    reason: "Lunch",
    codeId: null,
  });
  expect(() =>
    applyReasonCode({ category: "planned", reason: " " }, undefined),
  ).toThrow();
});

it("refuses a retired or unknown code", () => {
  expect(() =>
    applyReasonCode(
      { category: "unplanned", codeId: 4 },
      { ...code, active: false },
    ),
  ).toThrow(/no longer listed/);
  expect(() =>
    applyReasonCode({ category: "unplanned", codeId: 9 }, undefined),
  ).toThrow();
});
