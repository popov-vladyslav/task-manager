// Flat ESLint config for the whole monorepo (run `npm run lint` from the root).
// A shared JS/TS base, with Expo/React-Native rules scoped to app/ and Node rules
// scoped to server/. Prettier owns formatting, so eslint-config-prettier turns off
// any stylistic rules that would fight it.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import expoConfig from 'eslint-config-expo/flat.js';
import reactNative from 'eslint-plugin-react-native';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'app/.expo/**',
      'app/android/**',
      'app/ios/**',
      'app/expo-env.d.ts',
      'app/scripts/**',
      'server/drizzle/**',
      'patches/**',
      // Reference/vendored bundles and generated output — not our source.
      'design/**',
      'docs/**',
      'secrets/**',
      '.playwright-mcp/**',
      '**/*.config.js',
      '**/*.config.mjs',
    ],
  },

  // Base for every TS/JS file.
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // App — Expo / React Native. eslint-config-expo brings the react, react-hooks,
  // react-native and import plugins + the TS parser.
  {
    files: ['app/**/*.{ts,tsx}'],
    extends: [...expoConfig],
    plugins: { 'react-native': reactNative },
    rules: {
      // Migrating inline styles to StyleSheet.create incrementally — a warning so
      // it flags new/edited code without blocking the build on the existing backlog.
      'react-native/no-inline-styles': 'warn',
    },
  },

  // Server + shared — Node/TypeScript, no React.
  {
    files: ['server/**/*.ts', 'packages/shared/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Turn off rules that conflict with Prettier — keep it last.
  prettier,
);
