"use strict";

// @ts-check

const globals = require("globals");
const js = require("@eslint/js");

const jest = require("eslint-plugin-jest");

module.exports = [
  // 1. Global ignores
  {
    ignores: ["node_modules/", "session/"],
  },

  // 2. Recommended config
  js.configs.recommended,

  // 3. Custom language options and rules
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },

  // 4. Jest config
  {
    files: ["**/*.test.js"],
    ...jest.configs["flat/recommended"],
  },
];
