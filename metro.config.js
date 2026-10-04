// Learn more: https://docs.expo.dev/guides/customizing-metro/
// Wrapped with Sentry's config so source maps upload during EAS builds.
const fs = require('fs');
const path = require('path');
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

// three's CommonJS entry (picked for `require('three')`, e.g. from
// @react-three/fiber's CJS build) calls Node's process.emitWarning, which
// doesn't exist in React Native and crashes at import. Always resolve the
// bare `three` import to the ES module build.
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'three') {
    return { type: 'sourceFile', filePath: path.join(__dirname, 'node_modules/three/build/three.module.js') };
  }
  // Unity Asset Store exports live in the gitignored assets/licensed/ (EULA:
  // ship in the app, never in the public repo). A checkout without them
  // builds anyway: the import becomes an empty module and the game falls
  // back to its own art.
  if (moduleName.includes('assets/licensed/')) {
    const file = path.resolve(path.dirname(context.originModulePath), moduleName);
    if (!fs.existsSync(file)) return { type: 'empty' };
  }
  return (resolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
