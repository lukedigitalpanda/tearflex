module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|nativewind|@react-native-community/.*|expo-modules-core)/)',
  ],
  moduleNameMapper: {
    // Prevent nativewind from pulling in its own react-native copy during tests
    '^nativewind/jsx-runtime$': 'react/jsx-runtime',
    '^nativewind/jsx-dev-runtime$': 'react/jsx-dev-runtime',
  },
}
