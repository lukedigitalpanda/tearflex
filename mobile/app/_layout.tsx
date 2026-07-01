import '../global.css';
import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query';
import { AuthExpiredError } from '@/lib/api';
import { getTokens } from '@/lib/secureTokens';
import { useAuthStore } from '@/store/auth';

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof AuthExpiredError) {
        useAuthStore.getState().clear();
      }
    },
  }),
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="auto" />
      <AuthGate>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="patient/[id]" />
          <Stack.Screen name="assessment/select-test" />
          <Stack.Screen name="assessment/acquire" />
          <Stack.Screen name="assessment/instructions" />
          <Stack.Screen name="assessment/capture" />
          <Stack.Screen name="assessment/review" />
          <Stack.Screen name="assessment/processing" />
          <Stack.Screen name="assessment/results" />
          <Stack.Screen name="assessment/topography-capture" />
          <Stack.Screen name="assessment/topography-processing" />
          <Stack.Screen name="assessment/topography-results" />
        </Stack>
      </AuthGate>
    </QueryClientProvider>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const segments = useSegments();
  const router = useRouter();

  // On mount: read SecureStore to determine initial auth state
  useEffect(() => {
    getTokens()
      .then(({ refresh }) => { setAuthenticated(!!refresh); })
      .catch(() => { setAuthenticated(false); })
      .finally(() => { setReady(true); });
  }, []);

  // Redirect whenever auth state or route changes
  useEffect(() => {
    if (!ready) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)/');
    }
  }, [ready, isAuthenticated, segments]);

  if (!ready) return null;
  return <>{children}</>;
}
