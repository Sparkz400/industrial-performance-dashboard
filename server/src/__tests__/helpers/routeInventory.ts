import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const serverRoot = fileURLToPath(new URL("../../../", import.meta.url));
export type Route = { method: string; path: string };

function routesIn(file: string, prefix: string): Route[] {
  const source = readFileSync(file, "utf8");
  const routes: Route[] = [];
  for (const match of source.matchAll(
    /router\.(get|post|put|patch|delete)\(\s*(\[[^\]]*\]|"[^"]*"|'[^']*')/g,
  ))
    for (const quoted of match[2].match(/["'][^"']*["']/g) ?? []) {
      const path = quoted.slice(1, -1);
      routes.push({
        method: match[1].toUpperCase(),
        path: prefix + (path === "/" ? "" : path),
      });
    }
  for (const match of source.matchAll(/router\.use\(\s*(\w+)\s*\)/g)) {
    const sub = new RegExp(`import ${match[1]} from "(\\.[^"]+)\\.js"`).exec(
      source,
    );
    if (sub)
      routes.push(...routesIn(join(dirname(file), sub[1] + ".ts"), prefix));
  }
  return routes;
}

/** Static inventory of /api/v1 routes from app.ts mounts; paths are relative to /api/v1. */
export function routeInventory() {
  const app = readFileSync(join(serverRoot, "app.ts"), "utf8");
  const files = new Map(
    [
      ...app.matchAll(
        /import (\w+)(?:, \{[^}]*\})? from "\.\/(src\/[^"]+)\.js";/g,
      ),
    ].map((m) => [m[1], join(serverRoot, m[2] + ".ts")]),
  );
  const mounts = [
    ...app.matchAll(/app\.use\(\s*"\/api\/v1(\/[^"]+)",([\s\S]*?)\);/g),
  ]
    .map((m) => ({
      prefix: m[1],
      router: m[2]
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .at(-1)!,
    }))
    .filter((mount) => files.has(mount.router));
  return {
    mounts,
    routes: mounts.flatMap((m) => routesIn(files.get(m.router)!, m.prefix)),
  };
}

export const concretePath = (template: string, id = "1") =>
  template.replace(/\{[^}]*\}/g, "").replace(/:\w+/g, id);
