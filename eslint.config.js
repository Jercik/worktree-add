import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { includeIgnoreFile } from "@eslint/compat";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import path from "node:path";
import { defineConfig } from "eslint/config";
import vitest from "@vitest/eslint-plugin";
import eslintPluginUnicorn from "eslint-plugin-unicorn";

const gitignorePath = path.join(import.meta.dirname, ".gitignore");

export default defineConfig(
  includeIgnoreFile(gitignorePath, "Copy patterns from .gitignore"),

  {
    name: "Base config for all JS/TS files",
    files: ["**/*.{js,mjs,cjs,ts,tsx,mts,cts}"],
    extends: [js.configs.recommended, tseslint.configs.strictTypeChecked],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      // Security rules
      "no-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",

      // Correctness rules
      "no-return-assign": ["error", "always"],
      radix: ["error", "as-needed"],
      "guard-for-in": "error",
      "prefer-object-has-own": "error",

      // Clarity rules
      "prefer-regex-literals": ["error", { disallowRedundantWrapping: true }],
      "require-unicode-regexp": "error",
      "no-extend-native": "error",
      "no-new-wrappers": "error",
      "no-implicit-coercion": ["error", { allow: ["!!"] }],
    },
  },

  eslintPluginUnicorn.configs.recommended,

  {
    name: "Disable type-checking for config files",
    files: ["*.config.{js,ts,mjs,mts}"],
    extends: [tseslint.configs.disableTypeChecked],
  },

  {
    name: "Vitest rules for test files",
    files: [
      "**/*.{test,spec}.{ts,tsx,js,mjs,cjs,mts,cts}",
      "tests/**/*.{ts,tsx,js,mjs,cjs,mts,cts}",
    ],
    plugins: { vitest },
    extends: [vitest.configs.recommended],
    languageOptions: {
      globals: { ...vitest.environments.env.globals },
    },
  },

  eslintConfigPrettier,
);
