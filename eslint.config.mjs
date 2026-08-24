import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import prettierConfig from "eslint-config-prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "convex/_generated/**",
      ".opencode/**",
      ".pi/**",
      "next-env.d.ts",
    ],
  },
  {
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/lib/session-challenge/*",
                "../lib/session-challenge/*",
                "../../lib/session-challenge/*",
                "../../../lib/session-challenge/*",
              ],
              message:
                "Import session challenge capabilities only from the @/lib/session-challenge index.",
            },
          ],
        },
      ],
    },
  },
  prettierConfig,
];

export default eslintConfig;
