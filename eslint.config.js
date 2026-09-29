// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // supabase/functions are Deno (URL imports) — lint them with `deno lint`.
    ignores: ['dist/*', 'supabase/functions/**'],
  },
]);
