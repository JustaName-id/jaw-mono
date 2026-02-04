const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

// Find the project root folder (monorepo root)
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch all files in the monorepo
config.watchFolders = [monorepoRoot];

// Let Metro know where to resolve packages
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Enable package exports resolution (needed for ox, viem, etc.)
config.resolver.unstable_enablePackageExports = true;

// Set condition names to prioritize require (CommonJS) for compatibility
// This fixes eventemitter3 resolution issues where ESM imports from CJS
// Include '@jaw-mono/source' to use source files from workspace packages
config.resolver.unstable_conditionNames = [
  '@jaw-mono/source',
  'require',
  'react-native',
  'default',
];

// Ensure we can resolve workspace packages
config.resolver.disableHierarchicalLookup = true;

// Handle symlinks for workspace packages
config.resolver.extraNodeModules = {
  '@jaw/ui-native': path.resolve(monorepoRoot, 'packages/ui-native'),
  '@jaw.id/core': path.resolve(monorepoRoot, 'packages/core'),
};

// Add resolver to handle .js extension imports from TypeScript source files
// This is needed because packages use .js extensions in imports (ESM style)
// but we're consuming the TypeScript source directly
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Force eventemitter3 to use the CJS file directly to avoid ESM->CJS interop issues
  if (moduleName === 'eventemitter3') {
    return {
      filePath: path.resolve(projectRoot, 'node_modules/eventemitter3/index.js'),
      type: 'sourceFile',
    };
  }

  // If the module ends with .js and it's a relative import, try resolving without the extension
  if (moduleName.endsWith('.js') && (moduleName.startsWith('./') || moduleName.startsWith('../'))) {
    const withoutExtension = moduleName.slice(0, -3);
    try {
      return context.resolveRequest(context, withoutExtension, platform);
    } catch {
      // Fall through to default resolution
    }
  }
  // Default resolution
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
