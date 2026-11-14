import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "scripts/**",
      "public/**",
      "*.js",
      "*.mjs",
      "*.json",
    ],
  },
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-require-imports": "error",
      "@next/next/no-html-link-for-pages": "error",
      // Remaining React Compiler debt (tracked in #590). These two are the only rules
      // still downgraded; `npm run lint` enforces a warning budget so they cannot grow.
      // Ratchet the --max-warnings value of the `lint` script in package.json down as call sites are fixed.
      "react-hooks/static-components": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "error",
      "react-hooks/preserve-manual-memoization": "error",
      "react-hooks/refs": "error",
      "react-hooks/set-state-in-render": "error",
      "react-hooks/purity": "error",
      "react/no-unescaped-entities": "error",
      "prefer-const": "error",
      "@typescript-eslint/no-unsafe-function-type": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: [
      "app/(dashboard)/ledger/page.tsx",
      "app/(dashboard)/expenses/page.tsx",
      "app/(dashboard)/clients/page.tsx",
      "app/api/expenses/[id]/route.ts",
      "app/api/invoices/[id]/pay/route.ts",
      "lib/types/business.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
]);
