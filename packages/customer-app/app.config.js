const path = require('path');

const projectRoot = __dirname;

function asset(pathFromAssets) {
  return path.join(projectRoot, 'assets', 'images', pathFromAssets);
}

const appJson = require('./app.json');
const expo = appJson.expo;

const resolved = {
  expo: {
    ...expo,
    extra: {
      ...(expo.extra || {}),
      eas: {
        ...(expo.extra?.eas || {}),
        projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || expo.extra?.eas?.projectId,
      },
    },
    icon: asset('icon.png'),
    android: {
      ...expo.android,
      // Android adaptive icon disabled: prebuild fails with "Could not find MIME for Buffer <null>"
      // in @expo/image-utils/jimp when generating adaptive icons. Single icon works.
      adaptiveIcon: undefined,
    },
    web: {
      ...expo.web,
      favicon: asset('favicon.png'),
    },
    plugins: [
      'expo-av',
      'expo-notifications',
      'expo-router',
      [
        'expo-splash-screen',
        {
          image: asset('splash-icon.png'),
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
        },
      ],
    ],
    experiments: expo.experiments,
  },
};
module.exports = resolved;
