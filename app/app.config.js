const VARIANTS = {
  production: {
    name: 'Task Tracker',
    icon: './assets/images/icon.png',
    id: 'net.tasktracker.app',
  },
  stage: {
    name: 'Task Tracker (stage)',
    icon: './assets/images/icon-stage.png',
    id: 'net.tasktracker.app.stage',
  },
};

module.exports = ({ config }) => {
  const variant = process.env.APP_VARIANT === 'stage' ? VARIANTS.stage : VARIANTS.production;
  if (process.env.APP_VARIANT && !process.env.EXPO_PUBLIC_API_URL) {
    throw new Error(
      `EXPO_PUBLIC_API_URL is unset for APP_VARIANT=${process.env.APP_VARIANT}. ` +
        `On EAS it comes from the profile's environment, which loads only on the ` +
        `builder — run local commands as: eas env:exec <environment> "<command>".`,
    );
  }
  return {
    ...config,
    name: variant.name,
    icon: variant.icon,
    scheme: variant.id,
    ios: { ...config.ios, bundleIdentifier: variant.id },
    android: { ...config.android, package: variant.id },
  };
};
