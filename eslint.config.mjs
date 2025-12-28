// @ts-check

import { default as js } from '@eslint/js'
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended'
import tseslint from 'typescript-eslint'

export default [
    { files: ['src/**/*.{ts}'] },
    { ignores: ['node_modules/**', 'dist/**', 'vitest.config.ts', 'eslint.config.mjs'] },
    ...tseslint.config(js.configs.recommended, ...tseslint.configs.recommended),
    eslintPluginPrettier,
    {
        languageOptions: {
            parserOptions: {
                project: ['./tsconfig.json'],
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/explicit-function-return-type': 'warn',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                },
            ],
            '@typescript-eslint/no-floating-promises': 'warn',
            '@typescript-eslint/await-thenable': 'error',
            '@typescript-eslint/no-misused-promises': 'error',
            '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
            '@typescript-eslint/explicit-function-return-type': [
                'warn',
                {
                    allowExpressions: true,
                    allowIIFEs: true,
                    allowTypedFunctionExpressions: true,
                },
            ],
            '@typescript-eslint/no-floating-promises': 'error',
            curly: 'error',
            eqeqeq: ['error', 'always', { null: 'ignore' }],
            'no-var': 'error',
            'prefer-const': 'error',
            'no-throw-literal': 'error',
            'no-lonely-if': 'error',
            'no-else-return': 'error',
            'object-shorthand': 'error',
            'prefer-template': 'error',
        },
    },
]
