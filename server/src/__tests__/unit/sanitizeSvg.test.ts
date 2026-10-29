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

it.each([
  '<svg><use href="data:image/svg+xml;base64,PHN2Zz4="/></svg>',
  '<svg><use xlink:href="https://attacker.example/x.svg#a"/></svg>',
  '<svg><animate attributeName="href" to="javascript:alert(1)"/></svg>',
  '<svg><set attributeName="onmouseover" to="alert(1)"/></svg>',
  '<svg><rect fill="url(javascript:alert(1))"/></svg>',
  '<svg><rect fill="url(https://attacker.example/track)"/></svg>',
  "<svg><style>@import url(https://attacker.example/x.css)</style></svg>",
  '<svg><image href="https://attacker.example/track.png"/></svg>',
  '<svg><rect style="background:url(https://attacker.example)"/></svg>',
  "<svg><![CDATA[<script>alert(1)</script>]]></svg>",
])("removes active or external content: %s", (svg) => {
  expect(sanitizeSvg(svg)).not.toMatch(
    /javascript:|attacker\.example|data:|<script|onmouseover|<animate|<set|@import/i,
  );
});

it("keeps internal gradient references", () => {
  const clean = sanitizeSvg(
    '<svg><defs><linearGradient id="g"/></defs><rect fill="url(#g)"/></svg>',
  );
  expect(clean).toContain('fill="url(#g)"');
});
