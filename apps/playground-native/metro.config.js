const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

config.resolver.unstable_enablePackageExports = true;

config.resolver.unstable_conditionNames = [
  '@jaw-mono/source',
  'require',
  'react-native',
  'default',
];

// Prevent Metro from walking up directory trees to find node_modules.
// This avoids version mismatches when workspace packages (e.g. ui-native)
// have their own node_modules with different versions of react-native.
config.resolver.disableHierarchicalLookup = true;

config.resolver.extraNodeModules = {
  '@jaw/ui-native': path.resolve(monorepoRoot, 'packages/ui-native'),
  '@jaw.id/core': path.resolve(monorepoRoot, 'packages/core'),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Fix: Use monorepoRoot instead of projectRoot for eventemitter3
  if (moduleName === 'eventemitter3') {
    return {
      filePath: path.resolve(monorepoRoot, 'node_modules/eventemitter3/index.js'),
      type: 'sourceFile',
    };
  }

  if (moduleName.endsWith('.js') && (moduleName.startsWith('./') || moduleName.startsWith('../'))) {
    const withoutExtension = moduleName.slice(0, -3);
    try {
      return context.resolveRequest(context, withoutExtension, platform);
    } catch {
      // Fall through
    }
  }

  try {
    return context.resolveRequest(context, moduleName, platform);
  } catch (error) {
    // Fallback for bun's .bun hoisted layout: when disableHierarchicalLookup
    // prevents Metro from finding transitive deps (e.g. invariant required by
    // react-native), use Node.js resolution from the importing file's directory.
    // This works because bun places each package's deps in its own
    // .bun/<pkg>@<ver>/node_modules/ scope, which Node.js can walk up to find.
    if (!moduleName.startsWith('.') && !moduleName.startsWith('/')) {
      try {
        const originDir = path.dirname(context.originModulePath);
        const resolved = require.resolve(moduleName, { paths: [originDir] });
        return { filePath: resolved, type: 'sourceFile' };
      } catch {
        // Fall through to original error
      }
    }
    throw error;
  }
};

module.exports = withNativeWind(config, { input: './global.css' });
