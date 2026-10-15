import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
    esbuild: {
        jsx: 'automatic',
    },
    test: {
        environment: 'jsdom',
        include: ['tests/react/**/*.test.ts', 'tests/react/**/*.test.tsx'],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '.'),
        },
    },
})
