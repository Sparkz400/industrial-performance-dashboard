import { expect, it } from "vitest";
import { redactRequestUrl } from "../../utils/requestLog.js";

it("removes query credentials and bearer path tokens while retaining useful routes", () => {
  expect(
    redactRequestUrl("/api/v1/auth/oidc/callback?code=secret&state=private"),
  ).toBe("/api/v1/auth/oidc/callback");
  expect(
    redactRequestUrl("/api/v1/share/public/secret/widgets/count/data?start=1"),
  ).toBe("/api/v1/share/public/[redacted]/widgets/count/data");
  expect(redactRequestUrl("/embed/secret")).toBe("/embed/[redacted]");
  expect(redactRequestUrl("/api/v1/machines/7")).toBe("/api/v1/machines/7");
});
