import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        testTimeout: 10000,
        hookTimeout: 10000,
        include: ['src/tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'],
        exclude: ['src/tests/manual/**/*'],
    },
})
