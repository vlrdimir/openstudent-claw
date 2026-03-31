import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import eslintPluginImport from "eslint-plugin-import";
import eslintPluginPrettier from "eslint-plugin-prettier";
import tseslint from "typescript-eslint";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const configDir = dirname(fileURLToPath(import.meta.url));

const compat = new FlatCompat({
  baseDirectory: configDir,
});

export default tseslint.config(
  {
    ignores: ["node_modules/**", ".sisyphus/**"],
  },
  js.configs.recommended,
  ...compat.extends("airbnb-base", "plugin:prettier/recommended"),
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    plugins: {
      import: eslintPluginImport,
      prettier: eslintPluginPrettier,
    },
    settings: {
      "import/resolver": {
        typescript: {
          project: "./tsconfig.json",
        },
      },
    },
  },
  {
    files: [
      "eslint.config.js",
      "*.config.js",
      "*.config.ts",
      "drizzle.config.ts",
    ],
    rules: {
      "import/no-extraneous-dependencies": [
        "error",
        {
          devDependencies: true,
          optionalDependencies: true,
          peerDependencies: true,
        },
      ],
      "import/no-unresolved": "off",
    },
  },
  {
    files: ["src/lib/db/schema/**/*.ts"],
    rules: {
      "import/prefer-default-export": "off",
    },
  },
  {
    files: ["src/scripts/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["src/lib/elearning/**/*.ts", "src/lib/utils/**/*.ts"],
    rules: {
      "import/prefer-default-export": "off",
    },
  },
);
