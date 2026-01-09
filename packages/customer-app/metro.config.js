const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Find the project and workspace directories
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [workspaceRoot];

// 2. Let Metro know where to resolve packages (prioritize workspace root)
config.resolver.nodeModulesPaths = [
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Tell Metro to look for source extensions
config.resolver.sourceExts = ['js', 'jsx', 'json', 'ts', 'tsx', 'cjs', 'mjs'];

// 4. Map the main entry point for the customer app
config.resolver.extraNodeModules = {
  // Ensure all @scope packages resolve from workspace root
  ...require('module').builtinModules.reduce((acc, name) => {
    acc[name] = path.join(workspaceRoot, 'node_modules', name);
    return acc;
  }, {}),
};

module.exports = config;

