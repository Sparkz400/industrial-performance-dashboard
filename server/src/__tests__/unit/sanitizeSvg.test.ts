import { expect, it } from "vitest";
import { sanitizeSvg } from "../../utils/sanitizeSvg.js";

it("keeps diagram geometry and removes scripts, unquoted handlers, active URLs and HTML", () => {
  const clean = sanitizeSvg(
    '<svg xmlns="http://www.w3.org/2000/svg" onload=alert(1)><script>alert(1)</script><rect id="machine" width="20" fill="red" onclick=alert(1)/><a href="javascript:alert(1)"><text>Label</text></a><foreignObject><iframe srcdoc="attack"/></foreignObject></svg>',
  );
  expect(clean).toContain('id="machine"');
  expect(clean).toContain('fill="red"');
  expect(clean).not.toMatch(
    /script|onload|onclick|foreignObject|iframe|srcdoc/i,
  );
});
