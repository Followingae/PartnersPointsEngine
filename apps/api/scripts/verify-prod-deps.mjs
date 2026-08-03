/**
 * Every package the built server imports must survive the production prune.
 *
 * The Dockerfile ships `pnpm deploy --prod`, which drops devDependencies. So a
 * runtime import of something listed under devDependencies compiles, typechecks,
 * passes every test, boots fine locally — and then the container exits on
 * MODULE_NOT_FOUND, the health check never passes, and the platform quietly
 * keeps serving the previous build. The deploy "succeeds" and nothing changes.
 *
 * That has now happened three times on this repo. `verify-boot.mjs` cannot
 * catch it: it boots from the development tree, where devDependencies are
 * present. This boots the question instead — prune exactly as the image does,
 * then resolve every external import in `dist` against what survived.
 *
 *   node scripts/verify-prod-deps.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { builtinModules } from 'node:module';

const API_DIR = process.cwd();
const DIST = join(API_DIR, 'dist');

/** `require('pg')` / `require("@nestjs/common")` — what the compiled CJS emits. */
const REQUIRE = /require\(["']([^"'.][^"']*)["']\)/g;

/** "@scope/pkg/sub" → "@scope/pkg"; "pg/lib/x" → "pg". */
function packageOf(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

const builtins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

const files = walk(DIST);
if (files.length === 0) {
  console.error('  no dist/ — run `pnpm build` first');
  process.exit(1);
}

const needed = new Set();
for (const f of files) {
  for (const m of readFileSync(f, 'utf8').matchAll(REQUIRE)) {
    const pkg = packageOf(m[1]);
    if (!builtins.has(pkg) && !builtins.has(m[1])) needed.add(pkg);
  }
}

const out = mkdtempSync(join(tmpdir(), 'rfm-proddeps-'));
try {
  execFileSync(
    'pnpm',
    ['--filter', '@rfm-loyalty/api', 'deploy', '--prod', '--legacy', out],
    {
      cwd: join(API_DIR, '..', '..'),
      stdio: 'pipe',
      // Windows needs a shell to find pnpm's .cmd shim. Every argument here is
      // a literal — nothing from outside this file reaches the command line.
      shell: process.platform === 'win32',
    },
  );

  // Resolve from inside the pruned tree, which is what the container has.
  const resolve = createRequire(join(out, 'noop.js')).resolve;
  const missing = [];
  for (const pkg of [...needed].sort()) {
    try {
      resolve(pkg);
    } catch {
      // Optional peer deps that Nest requires lazily inside try/catch are not
      // real failures; anything genuinely needed at boot is caught by
      // verify-boot, which runs against this same set.
      missing.push(pkg);
    }
  }

  if (missing.length > 0) {
    console.error(`  MISSING FROM THE PRODUCTION IMAGE (${missing.length}):`);
    for (const m of missing) console.error(`    ${m}`);
    console.error('\n  Move these from devDependencies to dependencies in apps/api/package.json.');
    process.exit(1);
  }

  console.log(`  ${needed.size} imported packages all survive the production prune`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
