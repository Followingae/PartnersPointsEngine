// Metro config for the Expo app inside the pnpm Turborepo.
// Watches the repo root and resolves modules from both the app and root
// node_modules (pnpm hoists most deps to the root store).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..', '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Hierarchical lookup stays ON, which is the opposite of what Expo's monorepo
// guide says — and correct here, because that guide assumes a hoisted npm or
// yarn layout where every package sits flat in the root node_modules.
//
// pnpm does not do that. A package's dependencies are symlinked next to it
// inside .pnpm/<pkg>/node_modules/, so `expo` finds `expo-modules-core` by
// Metro walking up from the importing file. Disabling that leaves only the two
// directories above, and `expo-modules-core` is in neither.
//
// This built locally for months anyway: a stale copy of expo-modules-core was
// sitting in the workspace root from some earlier install, so the flat lookup
// happened to hit. A clean install has no such copy, which is why the first EAS
// build was also the first honest test of this file.

module.exports = config;
