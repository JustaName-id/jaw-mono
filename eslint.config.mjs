import nx from "@nx/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";

export default [
    ...nx.configs["flat/base"],
    ...nx.configs["flat/typescript"],
    ...nx.configs["flat/javascript"],
    {
      "ignores": [
        "**/dist",
        "**/.next",
        "**/out",
        "**/vite.config.*.timestamp*",
        "**/vitest.config.*.timestamp*"
      ]
    },
    {
        files: [
            "**/*.ts",
            "**/*.tsx",
            "**/*.js",
            "**/*.jsx"
        ],
        rules: {
            "@nx/enforce-module-boundaries": [
                "error",
                {
                    enforceBuildableLibDependency: true,
                    allow: [
                        "^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$"
                    ],
                    depConstraints: [
                        {
                            sourceTag: "*",
                            onlyDependOnLibsWithTags: [
                                "*"
                            ]
                        }
                    ]
                }
            ]
        }
    },
    {
        files: [
            "**/*.ts",
            "**/*.tsx",
            "**/*.cts",
            "**/*.mts",
            "**/*.js",
            "**/*.jsx",
            "**/*.cjs",
            "**/*.mjs"
        ],
        // Override or add rules here
        rules: {}
    },
    {
        files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
        plugins: {
            "react-hooks": reactHooks
        },
        rules: {
            ...reactHooks.configs.recommended.rules
        }
    }
];
