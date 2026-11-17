import fs from "node:fs";
import path from "node:path";
import {
  brochureAuthenticatedRoutes,
  brochurePublicRoutes,
  type BrochureRouteEntry,
} from "../docs/sales-brochure/brochure-routes";

const root = process.cwd();
const productImages = path.join(root, "docs/product-images");
const brochure = path.join(root, "docs/sales-brochure");
const themes = ["light", "dark"] as const;

const optionalDynamicRoutes: BrochureRouteEntry[] = [
  { id: "proposal_detail", path: "/proposals/:id", title: "Proposal detail", section: "sales" },
  { id: "payroll_run_detail", path: "/payroll/runs/:id", title: "Payroll run detail", section: "workspace" },
  { id: "public_shop", path: "/shop/:slug", title: "Public storefront", section: "public_shop" },
];

const imagePath = (id: string, theme: (typeof themes)[number]) =>
  path.join(productImages, "screenshots", theme, `${id}.png`);
const hasPair = (id: string) => themes.every((theme) => fs.existsSync(imagePath(id, theme)));

const requiredRoutes = [...brochurePublicRoutes, ...brochureAuthenticatedRoutes];
const missing = requiredRoutes.filter((route) => !hasPair(route.id));
if (missing.length > 0) {
  throw new Error(`Missing light/dark product images: ${missing.map((route) => route.id).join(", ")}`);
}

const routes = [...requiredRoutes, ...optionalDynamicRoutes.filter((route) => hasPair(route.id))];
const shots = Object.fromEntries(
  routes.map((route) => [
    route.id,
    {
      paths: {
        light: `screenshots/light/${route.id}.png`,
        dark: `screenshots/dark/${route.id}.png`,
      },
      title: route.title,
      section: route.section,
      route: route.path,
    },
  ]),
);
const generatedAt = new Date().toISOString();

fs.writeFileSync(
  path.join(productImages, "manifest.json"),
  `${JSON.stringify({ generatedAt, viewport: { width: 1440, height: 900 }, shots }, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(brochure, "brochure-manifest.json"),
  `${JSON.stringify(
    {
      generatedAt,
      shots: Object.fromEntries(
        routes.map((route) => [
          route.id,
          {
            relPath: `assets/screenshots/${route.id}.png`,
            title: route.title,
            section: route.section,
          },
        ]),
      ),
    },
    null,
    2,
  )}\n`,
);

console.log(`Wrote manifests for ${routes.length} light/dark screenshot pairs.`);
