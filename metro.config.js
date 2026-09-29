// Learn more: https://docs.expo.dev/guides/customizing-metro/
// Wrapped with Sentry's config so source maps upload during EAS builds.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

module.exports = config;
