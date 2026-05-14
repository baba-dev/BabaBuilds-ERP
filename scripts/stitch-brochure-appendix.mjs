#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "docs", "sales-brochure");
const INDEX = path.join(ROOT, "index.html");
const APPENDIX = path.join(ROOT, "api-appendix.html");
const OUT = path.join(ROOT, "index.dist.html");

const index = fs.readFileSync(INDEX, "utf8");
const marker = "<!-- API_APPENDIX -->";
if (!index.includes(marker)) {
  console.error("Missing marker in index.html:", marker);
  process.exit(1);
}
if (!fs.existsSync(APPENDIX)) {
  console.error("Run brochure:api-appendix first");
  process.exit(1);
}
const appendix = fs.readFileSync(APPENDIX, "utf8");
fs.writeFileSync(OUT, index.replace(marker, appendix), "utf8");
console.log("Wrote", path.relative(process.cwd(), OUT));
