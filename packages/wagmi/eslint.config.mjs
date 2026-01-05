import baseConfig from "../../eslint.config.mjs";

export default [
    ...baseConfig,
    {
        "files": [
            "**/*.json"
        ],
        "rules": {
            "@nx/dependency-checks": [
                "error",
                {
                    "ignoredFiles": [
                        "{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}"
                    ],
                    "ignoredDependencies": [
                        "vitest"
                    ]
                }
            ]
        },
        "languageOptions": {
            "parser": (await import('jsonc-eslint-parser'))
        }
    },
    {
        // Allow namespace syntax in internal files (matches wagmi's coding style)
        "files": [
            "**/internal/*.ts"
        ],
        "rules": {
            "@typescript-eslint/no-namespace": "off",
            "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }]
        }
    },
    {
        ignores: [
            "**/out-tsc"
        ]
    }
];
