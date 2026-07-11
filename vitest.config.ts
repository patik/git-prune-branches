import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        testTimeout: 10000,
        hookTimeout: 10000,
        // Several integration tests change process.cwd(), which is shared by all test files.
        fileParallelism: false,
        include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'],
        exclude: ['src/tests/demo/**/*'],
    },
})
