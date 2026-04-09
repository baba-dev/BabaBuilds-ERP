import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
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
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "scripts/**",
    "tmp/**",
    "*.js", // Ignore root JS files if they are just scripts
  ]),
]);

export default eslintConfig;
