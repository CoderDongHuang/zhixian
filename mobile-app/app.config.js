module.exports = ({ config }) => {
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || config.extra?.eas?.projectId;
  const sentryOrg = process.env.SENTRY_ORG;
  const sentryProject = process.env.SENTRY_PROJECT;
  const plugins = (config.plugins || []).filter((plugin) => plugin !== "@sentry/react-native/expo");
  if (sentryOrg && sentryProject) plugins.push(["@sentry/react-native/expo", { organization: sentryOrg, project: sentryProject }]);
  else plugins.push("@sentry/react-native/expo");
  return { ...config, plugins, runtimeVersion: { policy: "appVersion" }, updates: projectId ? { url: `https://u.expo.dev/${projectId}`, checkAutomatically: "ON_LOAD", fallbackToCacheTimeout: 0 } : { enabled: false }, extra: { ...config.extra, ...(projectId ? { eas: { projectId } } : {}) } };
};
