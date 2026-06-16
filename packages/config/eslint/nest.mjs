// @ts-check
import tseslint from 'typescript-eslint';
import base from './base.mjs';

/** ESLint config for the NestJS API (decorator-heavy, DI classes). */
export default tseslint.config(...base, {
  rules: {
    // NestJS DI relies on empty-ish classes and parameter decorators.
    '@typescript-eslint/no-extraneous-class': 'off',
    '@typescript-eslint/no-useless-constructor': 'off',
    '@typescript-eslint/parameter-properties': 'off',
  },
});
