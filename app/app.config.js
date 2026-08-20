// Per-variant app identity. app.json stays the declarative source for everything
// shared; this overrides only what differs, so a shared key cannot be dropped by
// hand-copying. Selected by EAS_BUILD_PROFILE, which EAS sets during a build;
// anything else (local `expo start`, `expo config`, the web export) gets
// production.
//
// The scheme is derived from the bundle id because it is globally unique. The
// previous generic `app://` was squattable, and in practice a magic link opened
// an unrelated application. server/src/env.ts APP_SCHEME must match these.
const VARIANTS = {
  production: {
    name: 'Task Tracker',
    icon: './assets/images/icon.png',
    id: 'com.vladyslavpopovpl.app',
  },
  stage: {
    name: 'Task Tracker (stage)',
    icon: './assets/images/icon-stage.png',
    id: 'com.vladyslavpopovpl.app.stage',
  },
};

module.exports = ({ config }) => {
  const variant = process.env.APP_VARIANT === 'stage' ? VARIANTS.stage : VARIANTS.production;
  return {
    ...config,
    name: variant.name,
    icon: variant.icon,
    scheme: variant.id,
    ios: { ...config.ios, bundleIdentifier: variant.id },
    android: { ...config.android, package: variant.id },
  };
};
