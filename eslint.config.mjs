// @ts-check

import { default as js } from '@eslint/js'
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended'
import tseslint from 'typescript-eslint'

export default [
    { files: ['src/**/*.{ts}'] },
    { ignores: ['node_modules/**', 'dist/**'] },
    ...tseslint.config(js.configs.recommended, ...tseslint.configs.recommended),
    eslintPluginPrettier,
    {
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    caughtErrors: 'none',
                },
            ],
            curly: 'error',
            eqeqeq: ['error', 'always', { null: 'ignore' }],
            'no-var': 'error',
            'prefer-const': 'error',
            'no-throw-literal': 'error',
            'no-return-await': 'error',
            'no-lonely-if': 'error',
            'no-else-return': 'error',
            'object-shorthand': 'error',
            'prefer-template': 'error',
        },
    },
]
