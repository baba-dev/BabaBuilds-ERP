import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync('package.json','utf8'));
const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
const core={
 'next':'16.4.5','react':'19.3.1','react-dom':'19.3.1',
 '@prisma/client':'7.10.1','prisma':'7.10.1','@prisma/adapter-pg':'7.10.1',
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
assert.equal(manifest.dependencies['@prisma/client'],'7.10.1');
assert.equal(manifest.devDependencies.prisma,'7.10.1');
console.log('ERP dependency security boundaries PASS');
