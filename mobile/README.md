# TearFlex Mobile App

React Native (Expo SDK 52+) mobile application for iOS and Android.

## Setup

```bash
npx create-expo-app@latest . --template tabs
npx expo install expo-camera expo-av expo-secure-store expo-notifications
npm install @tanstack/react-query zustand nativewind tailwindcss
npm install react-hook-form @hookform/resolvers zod
```

## Environment

Create `.env`:

```
EXPO_PUBLIC_API_URL=http://localhost:8000/api
```

## Development

```bash
npx expo start
```

- Press `i` for iOS simulator
- Press `a` for Android emulator
- Scan QR code with Expo Go for physical device

## Building for App Store / Google Play

```bash
npx eas build --platform ios
npx eas build --platform android
```
