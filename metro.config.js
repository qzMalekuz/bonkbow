// Learn more: https://docs.expo.dev/guides/customizing-metro/
// Wrapped with Sentry's config so source maps upload during EAS builds.
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
  return (resolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
