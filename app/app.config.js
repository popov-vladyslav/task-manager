// Per-variant app identity. app.json stays the declarative source for everything
// shared; this overrides only what differs, so a shared key cannot be dropped by
// hand-copying.
//
// Selected by APP_VARIANT, which must be set in TWO places — both are required:
//   1. eas.json, in each build profile's `env`, so the CLI resolving the config
//      locally (to pick the bundle id and credentials) sees it. Without it,
//      `eas build --profile stage` silently builds the PRODUCTION app.
//   2. each workflow's per-job `env`, because a profile's `env` reaches only the
//      job that names a profile. The `fingerprint` and `update` jobs do not, so
//      without it they resolve production identity, the fingerprint never matches
//      the stage build, and every push rebuilds instead of shipping an OTA.
// Anything with no APP_VARIANT (local `expo start`, `expo config`, the web
// export) gets production.
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
