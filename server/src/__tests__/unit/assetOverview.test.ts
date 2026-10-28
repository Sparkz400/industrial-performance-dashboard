import { describe, expect, it } from "vitest";
import { assetBindings } from "../../services/digitalTwinService.js";
import { sanitizeSvg } from "../../utils/sanitizeSvg.js";
describe("asset layout boundaries", () => {
  it("normalizes existing SVG bindings and rejects ambiguous element identities", () => {
    expect(
      assetBindings([{ svgElementId: "motor", nodeKey: "State" }]),
    ).toEqual([{ elementId: "motor", nodeKey: "State", label: "State" }]);
    expect(() =>
      assetBindings([
        { elementId: "motor", nodeKey: "State" },
        { elementId: "motor", nodeKey: "Other" },
      ]),
    ).toThrow("unique SVG IDs");
    expect(() =>
      assetBindings([{ elementId: "bad id", nodeKey: "State" }]),
    ).toThrow();
    expect(() => assetBindings(Array(101).fill({}))).toThrow("100");
  });
  it("keeps local shapes and gradients but strips scripts, remote resources and animation", () => {
    const clean = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"/></defs><rect id="motor" fill="url(#g)" onclick="alert(1)"/><image href="https://example.invalid/leak"/><use href="https://example.invalid/x.svg#p"/><rect filter="url(https://example.invalid/f.svg#x)"/><script>alert(1)</script><animate attributeName="href" values="https://example.invalid"/><foreignObject>bad</foreignObject></svg>',
    );
    expect(clean).toContain('id="motor"');
    expect(clean).toContain('fill="url(#g)"');
    expect(clean).not.toMatch(
      /https:|onclick|script|animate|foreignObject|<image/,
    );
  });
});
