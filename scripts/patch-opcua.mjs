import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const file = join(
  dirname(require.resolve("node-opcua-server")),
  "monitored_item.js",
);
const source = await readFile(file, "utf8");
const digest = createHash("sha256").update(source).digest("hex");
// node-opcua-server 2.187.16 wrongly requires Good quality when adding overflow bits.
// Keep its bit handling and diagnostic counters; reject changed upstream code for review.
const original =
  "9d8a11b4266be190fd3404e1489f3f414d34690fa80585e2321fabf35c72f071";
const patched =
  "ab14229b96d29a82c7135bbd86a96158ec89319263bfacffb07e0c32209b398e";
assert(
  [original, patched].includes(digest),
  "Review the OPC UA overflow patch for this dependency version",
);
if (digest === original) {
  const fixed = source
    .replace(
      "            assert(dataChangeNotification.value.statusCode.equals(StatusCodes.Good));\n",
      "",
    )
    .replace(
      "            assert(sameStatusCode(dataChangeNotification.value.statusCode, StatusCodes.GoodWithOverflowBit));\n",
      "",
    );
  assert.equal(createHash("sha256").update(fixed).digest("hex"), patched);
  await writeFile(file, fixed);
}
console.log("OPC UA overflow quality preservation patch verified");
