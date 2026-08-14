export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.pytest-tmp-*/**',
      '.pytest-basetemp/**',
      '.test-tmp/**',
      'var/**',
      'services/**/pytest-cache-files-*/**',
    ],
  },
  // TypeScript syntax is checked by tsc in stage 0; ESLint parser wiring is intentionally deferred.
  { files: ['**/*.mjs'], rules: {} },
];
