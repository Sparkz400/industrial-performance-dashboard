import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";

const purify = DOMPurify(new JSDOM("").window);
purify.addHook("uponSanitizeAttribute", (_node, data) => {
  if (
    (["href", "xlink:href"].includes(data.attrName) &&
      !data.attrValue.startsWith("#")) ||
    [...data.attrValue.matchAll(/url\(([^)]*)\)/gi)].some(
      (match) =>
        !match[1]
          .trim()
          .replace(/^['"]|['"]$/g, "")
          .startsWith("#"),
    )
  )
    data.keepAttr = false;
});

export function sanitizeSvg(svg: string): string {
  return purify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: [
      "foreignObject",
      "style",
      "a",
      "image",
      "animate",
      "animateMotion",
      "animateTransform",
      "set",
    ],
    FORBID_ATTR: ["style"],
  });
}
