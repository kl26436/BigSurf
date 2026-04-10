import js from '@eslint/js';
import prettier from 'eslint-config-prettier';

export default [
    js.configs.recommended,
    prettier,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                // Browser globals
                window: 'readonly',
                document: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                fetch: 'readonly',
                navigator: 'readonly',
                localStorage: 'readonly',
                crypto: 'readonly',
                URL: 'readonly',
                HTMLElement: 'readonly',
                MutationObserver: 'readonly',
                IntersectionObserver: 'readonly',
                Uint8Array: 'readonly',
                alert: 'readonly',
                confirm: 'readonly',
                prompt: 'readonly',
                requestAnimationFrame: 'readonly',
                cancelAnimationFrame: 'readonly',
                performance: 'readonly',
                CustomEvent: 'readonly',
                Event: 'readonly',
                AbortController: 'readonly',
                Notification: 'readonly',
                Chart: 'readonly',
                L: 'readonly',
                // Firebase
                importScripts: 'readonly',
                // Service Worker
                self: 'readonly',
                caches: 'readonly',
                clients: 'readonly',
                // Vitest globals
                describe: 'readonly',
                it: 'readonly',
                expect: 'readonly',
                beforeAll: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                afterAll: 'readonly',
                vi: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-undef': 'error',
            'no-console': 'off',
            'no-empty': 'warn',
            'no-case-declarations': 'warn',
            'no-useless-assignment': 'warn',
            'prefer-const': 'warn',
        },
    },
    {
        ignores: ['node_modules/**', 'functions/**', 'docs/**', '*.config.*'],
    },
];
