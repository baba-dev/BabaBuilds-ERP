#!/usr/bin/env bash
set -Eeuo pipefail
branch=security/dependabot-safe-remediation-2026-11
test "$(git branch --show-current)" = "$branch"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
test "$(node -p 'require("./package.json").engines.node')" = ">=26.13.1 <27"
test "$(npm --version)" = "11.20.0"
npm audit --json > /tmp/audit-before.json || true
update_stage() {
 STAGE="$1" node <<'JS'
const fs=require('node:fs');
const p=JSON.parse(fs.readFileSync('package.json','utf8'));
switch(Number(process.env.STAGE)){
case 2:
 p.overrides.axios='^1.21.1';
 p.overrides['follow-redirects']='^1.16.3';
 break;
case 3:
 p.overrides['brace-expansion@^1']='1.1.22';
 p.overrides['brace-expansion@^2']='2.1.8';
 p.overrides['brace-expansion@^4']='^5.0.13';
 p.dependencies['js-yaml']='^4.3.2';
 p.overrides['@humanfs/node']='^0.16.8';
 break;
case 4:
 p.overrides.postcss='^8.5.33';
 p.overrides.nanoid='^3.3.20';
 p.overrides['source-map-js']='^1.2.2';
 p.overrides['@tailwindcss/typography']={'postcss-selector-parser':'6.1.5'};
 break;
case 5:
 for(const name of ['@serwist/build','@serwist/next','@serwist/webpack-plugin'])
  p.overrides[name]={zod:'4.6.7'};
 break;
default:throw Error('invalid stage');
}
fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');
JS
}
verify_core() {
 node <<'JS'
const a=require('node:assert/strict');
const fs=require('node:fs');
const p=JSON.parse(fs.readFileSync('package.json','utf8'));
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
for(const [name,version] of Object.entries({
next:'16.4.5',react:'19.3.1','react-dom':'19.3.1',
'@prisma/client':'6.19.2',prisma:'6.19.2',
'@serwist/next':'9.5.13',serwist:'9.5.13','eslint-config-next':'16.4.5'
})) a.equal(lock.packages['node_modules/'+name]?.version,version,name+' changed unexpectedly');
a.equal(p.engines.node,'>=26.13.1 <27');
a.equal(p.packageManager,'npm@11.20.0');
JS
}
commit_deps() {
 update_stage "$1"
 npm install --package-lock-only --ignore-scripts --no-audit --no-fund --prefer-online
 verify_core
 git add package.json package-lock.json
 if git diff --cached --quiet; then echo "No changed dependencies for stage $1"; exit 1; fi
 git commit -m "$2"
}
commit_deps 2 "fix(deps): update axios and follow-redirects within v1"
commit_deps 3 "fix(deps): patch brace-expansion, YAML and humanfs"
commit_deps 4 "fix(deps): patch PostCSS toolchain and v6 selector parser"
commit_deps 5 "fix(deps): patch nested Serwist Zod without upgrading PWA stack"

mkdir -p docs/security
cat > docs/security/audit-workflow-proposal.md <<'DOC'
# Weekly ERP security audit policy

The scheduled audit should be read-only, reproducible, and independent of automatic deployment.

- Use GitHub-hosted runners with Node 26 from .nvmrc.
- Install lockfile dependencies reproducibly with npm ci --ignore-scripts.
- Capture both full-tree and production-only npm audit --json reports as artifacts.
- Publish vulnerability counts to the workflow summary.
- Give the workflow contents:read only, and do not invoke npm audit fix, create PRs or mutate branches.
- No deployment workflow changes are included.
DOC
git add docs/security/audit-workflow-proposal.md
git commit -m "docs(security): define read-only weekly audit policy"

mkdir -p scripts/security
cat > scripts/security/check-dependency-boundaries.mjs <<'JS'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync('package.json','utf8'));
const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
const core={
 'next':'16.4.5','react':'19.3.1','react-dom':'19.3.1',
 '@prisma/client':'6.19.2','prisma':'6.19.2',
 '@serwist/next':'9.5.13','serwist':'9.5.13','eslint-config-next':'16.4.5'
};
const version=(name)=>lock.packages['node_modules/'+name]?.version;
for(const [name,expected] of Object.entries(core))
 assert.equal(version(name),expected,'Pinned dependency changed: '+name);
function min(actual,expected){
 const a=actual?.split('.').map(Number),b=expected.split('.').map(Number);
 assert.ok(a&&a.length===3,expected+' package missing');
 return a[0]===b[0]&&(a[1]>b[1]||(a[1]===b[1]&&a[2]>=b[2]));
}
for(const [name,minimum] of Object.entries({
 axios:'1.21.1','follow-redirects':'1.16.3','js-yaml':'4.3.2',
 '@humanfs/node':'0.16.8',postcss:'8.5.33',nanoid:'3.3.20','source-map-js':'1.2.2'
})) assert.ok(min(version(name),minimum),name+' unsafe: '+version(name));
for(const [path,minimum] of Object.entries({
 'node_modules/minimatch/node_modules/brace-expansion':'1.1.21',
 'node_modules/readdir-glob/node_modules/brace-expansion':'2.1.7',
 'node_modules/brace-expansion':'5.0.12',
 'node_modules/@tailwindcss/typography/node_modules/postcss-selector-parser':'6.1.5'
})) assert.ok(min(lock.packages[path]?.version,minimum),path+' still vulnerable');
for(const parent of ['@serwist/build','@serwist/next','@serwist/webpack-plugin']) {
 const path='node_modules/'+parent+'/node_modules/zod';
 const installed=lock.packages[path]?.version??lock.packages['node_modules/zod']?.version;
 assert.ok(min(installed,'4.6.7'),parent+' unresolved vulnerable Zod');
 assert.equal(manifest.overrides[parent]?.zod,'4.6.7',parent+' scoped override missing');
}
assert.equal(manifest.dependencies['@prisma/client'],'^6.19.2');
assert.equal(manifest.devDependencies.prisma,'^6.19.2');
console.log('ERP dependency security boundaries PASS');
JS
node <<'JS'
const fs=require('node:fs');
const p=JSON.parse(fs.readFileSync('package.json','utf8'));
p.scripts['check:security-boundaries']='node scripts/security/check-dependency-boundaries.mjs';
fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');

JS
node scripts/security/check-dependency-boundaries.mjs
git add scripts/security/check-dependency-boundaries.mjs package.json
git commit -m "test(security): enforce patch bounds and excluded major versions"

npm ci --no-audit --no-fund
npm run check:security-boundaries
npm audit --json > /tmp/audit-after.json || true
node <<'JS'
const fs=require('node:fs');
const before=JSON.parse(fs.readFileSync('/tmp/audit-before.json','utf8'));
const after=JSON.parse(fs.readFileSync('/tmp/audit-after.json','utf8'));
const a=after.metadata?.vulnerabilities||{},b=before.metadata?.vulnerabilities||{};
for(const severity of ['critical','high'])
 if((a[severity]||0)>(b[severity]||0))throw Error('Regression in '+severity+' advisories');
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
let doc=fs.readFileSync('docs/security/dependency-remediation-2026-11.md','utf8');
doc+='\n## Patched versions in lockfile\n\n';
for(const name of ['axios','follow-redirects','js-yaml','@humanfs/node','postcss','nanoid','source-map-js','postcss-selector-parser','zod']){
 const matches=Object.keys(lock.packages).filter(k=>k.endsWith('node_modules/'+name));
 doc+='- '+name+': '+matches.map(k=>lock.packages[k].version+' ['+k+']').join(', ')+'\n';
}
doc+='\n## Audit snapshots\n\n- Before: '+JSON.stringify(b)+'\n- After: '+JSON.stringify(a)+'\n';
doc+='\nOne-shot generator has been removed. No production deployment workflow was changed.\n';
fs.writeFileSync('docs/security/dependency-remediation-2026-11.md',doc);
JS
rm scripts/security/remediate-once.sh
git add -A
git commit -m "docs(security): record residual advisories and remove temporary tooling"
test "$(git rev-list --count a03fdf681c1347d6bdcf75bea9a9101288644336..HEAD)" = 8
git log -8 --oneline
git push origin HEAD:"$branch"
