import { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useLogin } from '@/hooks/useAuth';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const passwordRef = useRef<import('react-native').TextInput>(null);

  function handleLogin() {
    if (!username || !password) return;
    login.mutate({ username, password });
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-slate-50 items-center justify-center px-6"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="w-full max-w-sm">
        <Text className="text-3xl font-bold text-teal-600 mb-1">TearFlex</Text>
        <Text className="text-sm text-slate-600 mb-8">Sign in to your practice account</Text>

        <Text className="text-sm font-medium text-slate-900 mb-1">Username</Text>
        <TextInput
          className="bg-white border border-slate-300 rounded-lg px-3 py-3 text-slate-900 mb-4"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          placeholder="username"
          placeholderTextColor="#94a3b8"
        />

        <Text className="text-sm font-medium text-slate-900 mb-1">Password</Text>
        <TextInput
          className="bg-white border border-slate-300 rounded-lg px-3 py-3 text-slate-900 mb-6"
          value={password}
          onChangeText={setPassword}
          ref={passwordRef}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleLogin}
          placeholder="password"
          placeholderTextColor="#94a3b8"
        />

        {login.isError && (
          <Text className="text-status-severe text-sm mb-4 text-center">
            Invalid username or password.
          </Text>
        )}

        <TouchableOpacity
          className="bg-teal-600 rounded-lg py-3 items-center"
          onPress={handleLogin}
          disabled={login.isPending}
          activeOpacity={0.8}
        >
          {login.isPending
            ? <ActivityIndicator color="white" />
            : <Text className="text-white font-semibold text-base">Sign in</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
