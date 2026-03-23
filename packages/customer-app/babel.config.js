module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated plugin must be listed last. Required for Reanimated 3.x with Expo.
    plugins: ['react-native-reanimated/plugin'],
  };
};
