import js from "@eslint/js";
import tseslint from "typescript-eslint";
import security from "eslint-plugin-security";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";

// The server holds the raw SQL, auth and file handling, so it gets the same security
// rules as the client; style is left to Prettier.
export default tseslint.config(
  { ignores: ["dist", "logs", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,ts}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
    plugins: { security },
    rules: {
      ...security.configs.recommended.rules,
      // Names, topics and filenames deliberately reject control characters.
      "no-control-regex": "off",
      // Pre-existing `any` (about 100 sites) is reported, not yet a build failure.
      "@typescript-eslint/no-explicit-any": "warn",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
    },
  },
  prettierConfig,
);
