import assert from "node:assert/strict";
import { readFile, realpath } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import Joi from "joi";
import {
  validateProfile,
  profileSchema,
} from "../server/dist/src/services/productionProfile.js";

const text = Joi.string().min(1).max(500).required();
const entrySchema = Joi.object({
  id: Joi.string()
    .pattern(/^[a-z][a-z0-9-]{2,60}$/)
    .required(),
  title: text,
  profile: Joi.string()
    .pattern(/^[a-z0-9-]+\.json$/)
    .required(),
  transport: Joi.string()
    .valid("opc-ua", "legacy-gateway", "manual")
    .required(),
  equipment: Joi.object({ model: text, firmware: text }).required(),
  qualification: Joi.object({
    level: Joi.string()
      .valid("simulator", "reported", "physically-verified")
      .required(),
    scope: text,
    evidence: Joi.array()
      .items(Joi.string().pattern(/^[a-zA-Z0-9_./-]+$/))
      .min(1)
      .max(10)
      .required(),
    reviewer: Joi.when("level", {
      is: "physically-verified",
      then: text,
      otherwise: Joi.forbidden(),
    }),
    testedOn: Joi.when("level", {
      is: "physically-verified",
      then: Joi.string().isoDate().required(),
      otherwise: Joi.forbidden(),
    }),
  }).required(),
  limitations: Joi.array().items(text).min(1).max(10).required(),
}).required();

export async function validateCatalog(catalog, root = resolve(".")) {
  const { error } = Joi.array()
    .items(entrySchema)
    .min(1)
    .max(200)
    .unique("id")
    .validate(catalog, { convert: false, allowUnknown: false });
  assert.ifError(error);
  const base = await realpath(root);
  const checked = [];
  for (const entry of catalog) {
    for (const file of [
      `profiles/${entry.profile}`,
      ...entry.qualification.evidence,
    ]) {
      const path = await realpath(resolve(base, file));
      const inside = relative(base, path);
      assert(
        inside && !inside.startsWith("..") && !isAbsolute(inside),
        "Catalog path escapes repository",
      );
    }
    const json = await readFile(
      resolve(base, "profiles", entry.profile),
      "utf8",
    );
    assert(Buffer.byteLength(json) <= 65536, "Profile exceeds 64 KiB");
    const input = JSON.parse(json);
    assert.ifError(
      profileSchema.validate(input, { convert: false, allowUnknown: false })
        .error,
    );
    const profile = validateProfile(input);
    assert.doesNotMatch(
      JSON.stringify(entry) + json,
      /BEGIN [A-Z ]*PRIVATE KEY|(?:opc\.tcp|https?):\/\/[^\s"]*@/i,
      "Remove credentials",
    );
    checked.push({ ...entry, mapping: profile });
  }
  return checked;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const entries = await validateCatalog(
    JSON.parse(await readFile("profiles/catalog.json", "utf8")),
  );
  console.log(
    JSON.stringify(
      {
        passed: true,
        profiles: entries.map(({ id, qualification }) => ({
          id,
          level: qualification.level,
        })),
      },
      null,
      2,
    ),
  );
}
