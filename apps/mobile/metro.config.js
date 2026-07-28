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
// pnpm uses symlinks; let Metro follow them and not climb above the workspace.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
