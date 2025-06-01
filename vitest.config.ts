import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        testTimeout: 30000, // Git operations can take some time
        hookTimeout: 30000,
        include: ['src/tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'],
        exclude: ['src/tests/setup.ts', 'src/tests/manual.ts'],
    },
})
