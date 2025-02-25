import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsdoc from 'eslint-plugin-jsdoc';
import security from 'eslint-plugin-security';
import {browser} from "globals";

// Export the configuration as an array
export default [
  {
    // Ignore the 'dist' directory for linting
    ignores: ['dist'],
  },
  {
    // Apply to JavaScript and JSX files
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      // Use the latest ECMAScript version
      ecmaVersion: 'latest',
      sourceType: 'module',
      // Define globals for browser environment
      globals: {
        ...(browser),
      },
      parserOptions: {
        // Enable JSX syntax
        ecmaFeatures: { jsx: true },
      },
    },
    // Define plugins to use
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      jsdoc,
      security,
    },
    // Define rules
    rules: {
      // Include recommended rules from ESLint, React, React Hooks, JSDoc, and Security plugins
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsdoc.configs.recommended.rules,
      ...security.configs.recommended.rules,

      // React rules
      'react/prop-types': 'error', // Enforce prop-types for type safety
      'react/jsx-key': 'error', // Ensure keys are provided for list items

      // Modern JavaScript rules
      'no-var': 'error', // Disallow 'var' (prefer 'let' or 'const')
      'prefer-const': 'error', // Enforce 'const' for variables that are not reassigned
      'arrow-body-style': ['error', 'as-needed'], // Enforce concise arrow function syntax

      // Code quality rules
      'no-console': ['error', { allow: ['warn', 'error'] }], // Disallow console.logs but allow warnings and errors
      'no-debugger': 'error', // Disallow debugger statements
      'no-unused-vars': ['warn', { vars: 'all', args: 'after-used', ignoreRestSiblings: true }], // Warn about unused variables

      // Security rules
      'security/detect-object-injection': 'error', // Enforce strict object injection checks
      'security/detect-non-literal-regexp': 'error', // Enforce non-literal RegExp checks

      // React Refresh rules
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }], // Ensure only components are exported
    },
    // React version detection settings
    settings: {
      react: { version: 'detect' },
    },
  },
];