const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Find the project and workspace directories
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [workspaceRoot];

// 2. Let Metro know where to resolve packages (prioritize workspace root for hoisted packages)
config.resolver.nodeModulesPaths = [
  path.resolve(workspaceRoot, 'node_modules'),
  path.resolve(projectRoot, 'node_modules'),
];

// 3. Force Metro to resolve (sub)dependencies only from the `nodeModulesPaths`
config.resolver.disableHierarchicalLookup = true;

// 4. Add this to resolve shared package and ensure proper module resolution
config.resolver.extraNodeModules = {
  '@seva/shared': path.resolve(workspaceRoot, 'packages/shared'),
  // Ensure expo-router resolves from workspace root
  'expo-router': path.resolve(workspaceRoot, 'node_modules/expo-router'),
};

module.exports = config;

