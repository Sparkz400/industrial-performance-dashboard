import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";

const purify = DOMPurify(new JSDOM("").window);

export function sanitizeSvg(svg: string): string {
  return purify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["foreignObject", "style"],
    FORBID_ATTR: ["style"],
  });
}
