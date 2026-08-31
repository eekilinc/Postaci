import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
export default [
  { ignores: ['dist/**', 'dist-desktop/**', 'node_modules/**'] },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { '@typescript-eslint': tseslint.plugin, 'react-hooks': reactHooks },
    rules: {
      'constructor-super': 'error', 'no-dupe-args': 'error', 'no-dupe-keys': 'error',
      'no-unreachable': 'error', 'valid-typeof': 'error', 'react-hooks/rules-of-hooks': 'error',
    },
  },
  { files: ['**/*.cjs'], languageOptions: { sourceType: 'commonjs' }, rules: { 'no-dupe-keys': 'error', 'no-unreachable': 'error' } },
];
