const path = require('path');

// Same pattern as worker-app: absolute asset paths + explicit plugins (avoids stale merges from app.json).
const asset = (name) => path.resolve(__dirname, 'assets', 'images', name);

module.exports = {
  expo: {
    name: 'Seva Customer',
    slug: 'seva-customer',
    version: '1.0.0',
    orientation: 'portrait',
    icon: asset('splash-icon-white-bg.png'),
    scheme: 'sevacustomer',
    extra: {
      eas: {
        projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
      },
    },
    userInterfaceStyle: 'automatic',
    newArchEnabled: false,
    ios: {
      bundleIdentifier: 'com.seva.customer',
      supportsTablet: true,
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          'Seva uses your location to show nearby services and set your booking address.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'Seva uses your location to show nearby services and set your booking address.',
        NSPhotoLibraryUsageDescription:
          'Seva needs photo library access so you can upload profile and booking photos.',
        NSCameraUsageDescription: 'Seva needs camera access to take photos for your profile or bookings.',
        NSMicrophoneUsageDescription:
          'Seva needs access to your microphone so you can send voice messages in chat.',
      },
    },
    android: {
      package: 'com.seva.customer',
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
          microphonePermission:
            'Seva needs access to your microphone so you can send voice messages in chat.',
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
