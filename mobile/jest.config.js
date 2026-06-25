module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|expo-constants|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|nativewind|@react-native-community/.*|expo-modules-core)/)',
  ],
  moduleNameMapper: {
    // nativewind/jsx-runtime is babel-preset-expo's jsxImportSource target.
    // In Jest it pulls a native-module layer that crashes (__fbBatchedBridgeConfig is not set).
    // We redirect to React's plain jsx-runtime as a shim.
    // CONSEQUENCE: className-driven NativeWind styles are NOT applied in tests.
    // Do not assert on styles that come from className; test style={} props or behavior/labels directly.
    '^nativewind/jsx-runtime$': 'react/jsx-runtime',
    '^nativewind/jsx-dev-runtime$': 'react/jsx-dev-runtime',
  },
}
