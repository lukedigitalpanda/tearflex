import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, loginRequest } from '@/lib/api';
import { clearTokens } from '@/lib/secureTokens';
import { useAuthStore } from '@/store/auth';
import type { Me } from '@shared/types/user';

export function useMe() {
  const setMe = useAuthStore((s) => s.setMe);
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const me = await api.get<Me>('auth/me/');
      setMe(me);
      return me;
    },
  });
}

export function useLogin() {
  const setMe = useAuthStore((s) => s.setMe);
  return useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      await loginRequest(username, password);
      return api.get<Me>('auth/me/');
    },
    onSuccess: (me) => setMe(me),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  const clear = useAuthStore((s) => s.clear);
  return useMutation({
    mutationFn: clearTokens,
    onSuccess: () => {
      clear();
      qc.clear();
    },
  });
}
