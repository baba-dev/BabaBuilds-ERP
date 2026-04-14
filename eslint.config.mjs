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
      "tmp/**",
      "public/**",
      "pwa/**",
      "*.js",
      "*.mjs",
      "*.json",
    ],
  },
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
]);
