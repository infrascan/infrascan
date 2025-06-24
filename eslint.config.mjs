import { defineConfig, globalIgnores } from "eslint/config";
import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import { configs } from "eslint-config-airbnb-extended/legacy";
import prettier from "eslint-config-prettier";
import turbo from "eslint-config-turbo/flat";

import path from "path";
import { fileURLToPath } from "url";

// mimic CommonJS variables -- not needed if using CommonJS
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default defineConfig([
  globalIgnores([
    "**/dist/**",
    "**/config.ts",
    "**/codegen.ts",
    "**/*.test.ts",
    "**/generated/*.ts",
  ]),
  js.configs.recommended,
  ...turbo,
  ...compat.extends("eslint-config-airbnb-base"),
  ...configs.base.typescript,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      "import/prefer-default-export": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": "off",
      "no-undef-init": "off",
      "no-await-in-loop": "off",
      "no-underscore-dangle": "off",
      "no-restricted-syntax": [
        "warn",
        "ForInStatement",
        "LabeledStatement",
        "WithStatement",
      ],
      "import/extensions": [
        "error",
        "always",
        {
          ts: "never",
        },
      ],
    },
    languageOptions: {
      parserOptions: {
        project: [
          "./aws-scanners/*/tsconfig.json",
          "./packages/*/tsconfig.json",
        ],
        tsconfigRootDir: process.cwd(),
      },
    },
  },
]);
