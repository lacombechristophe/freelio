import { defineConfig, globalIgnores } from "eslint/config";
import react from "eslint-plugin-react";
import hooks from "eslint-plugin-react-hooks";
import imports from "eslint-plugin-import";
import a11y from "eslint-plugin-jsx-a11y";
import ts from "typescript-eslint";
import globals from "globals";
import location from "./tooling/lint/no-location-assign-relative-destination.mjs";

export default defineConfig([
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    plugins: {
      react,
      "react-hooks": hooks,
      import: imports,
      "jsx-a11y": a11y,
      "@next/next": { rules: { "no-location-assign-relative-destination": location } },
    },
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    settings: {
      react: { version: "detect" },
      "import/parsers": { "@typescript-eslint/parser": [".ts", ".mts", ".cts", ".tsx", ".d.ts"] },
      "import/resolver": {
        node: { extensions: [".js", ".jsx", ".ts", ".tsx"] },
        typescript: { alwaysTryTypes: true },
      },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...hooks.configs.recommended.rules,
      "@next/next/no-location-assign-relative-destination": "warn",
      "import/no-anonymous-default-export": "warn",
      "react/no-unknown-property": "off",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react/jsx-no-target-blank": "off",
      "jsx-a11y/alt-text": ["warn", { elements: ["img"], img: ["Image"] }],
      "jsx-a11y/aria-props": "warn",
      "jsx-a11y/aria-proptypes": "warn",
      "jsx-a11y/aria-unsupported-elements": "warn",
      "jsx-a11y/role-has-required-aria-props": "warn",
      "jsx-a11y/role-supports-aria-props": "warn",
    },
  },
  ...ts.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
      "@typescript-eslint/no-explicit-any": "off",
      "react/no-unescaped-entities": "off",
    },
  },
  globalIgnores([
    ".next/**", ".next-*/**", "out/**", "build/**", "scratch/**", "tmp/**",
    "test-results/**", "playwright-report/**", "coverage/**", "src/generated/**", "next-env.d.ts",
  ]),
]);
