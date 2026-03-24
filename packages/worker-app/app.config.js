const path = require('path');

// Resolve to absolute path so prebuild finds assets when run from monorepo
const asset = (name) => path.resolve(__dirname, 'assets', 'images', name);

module.exports = {
  expo: {
    name: 'Seva Worker',
    slug: 'seva-worker',
    version: '1.0.0',
    orientation: 'portrait',
    // App icon + splash center image (1024×1024 PNG; keep in sync with customer app branding)
    icon: asset('splash-icon-white-bg.png'),
    scheme: 'sevaworker',
    extra: {
      eas: {
        projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
      },
    },
    userInterfaceStyle: 'automatic',
    newArchEnabled: false,
    ios: {
      bundleIdentifier: 'com.seva.worker',
      supportsTablet: true,
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          'Seva uses your location to set your work area so customers can find you for jobs.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'Seva uses your location to set your work area so customers can find you for jobs.',
        NSPhotoLibraryUsageDescription:
          'Seva needs photo library access to upload your profile picture, ID document, and past work photos.',
        NSCameraUsageDescription:
          'Seva needs camera access to take profile and ID photos.',
        NSMicrophoneUsageDescription:
          'Seva needs access to your microphone so you can send voice messages in chat.',
      },
    },
    android: {
      package: 'com.seva.worker',
      adaptiveIcon: {
        backgroundColor: '#ffffff',
        foregroundImage: asset('splash-icon-white-bg.png'),
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    web: {
      output: 'static',
      favicon: asset('favicon.png'),
    },
    plugins: [
      'expo-dev-client',
      'expo-notifications',
      'expo-router',
      [
        'expo-av',
        {
          microphonePermission: 'Seva needs access to your microphone so you can send voice messages in chat.',
        },
      ],
      [
        'expo-splash-screen',
        {
          image: asset('splash-icon-white-bg.png'),
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
          dark: {
            backgroundColor: '#ffffff',
          },
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
  },
};
