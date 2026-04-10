import js from "@eslint/js";
import prettier from "eslint-config-prettier";

export default [
    js.configs.recommended,
    prettier,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                // Browser globals
                window: "readonly",
                document: "readonly",
                console: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                fetch: "readonly",
                URL: "readonly",
                navigator: "readonly",
                localStorage: "readonly",
                crypto: "readonly",
                alert: "readonly",
                confirm: "readonly",
                MutationObserver: "readonly",
                IntersectionObserver: "readonly",
                HTMLElement: "readonly",
                Uint8Array: "readonly",
                Promise: "readonly",
                Notification: "readonly",
                ServiceWorkerRegistration: "readonly",
                CustomEvent: "readonly",
                requestAnimationFrame: "readonly",
                cancelAnimationFrame: "readonly",
                prompt: "readonly",
                L: "readonly", // Leaflet map library
            },
        },
        rules: {
            // Downgrade some recommended rules to warnings for gradual adoption
            "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
            "no-undef": "warn",
            "no-redeclare": "warn",
            "no-empty": "warn",
            "no-useless-assignment": "warn",
            "no-case-declarations": "warn",
        },
    },
    {
        // Ignore non-source files
        ignores: [
            "node_modules/**",
            "functions/**",
            "debug-scripts/**",
            "docs/**",
            "eslint.config.js",
        ],
    },
];
