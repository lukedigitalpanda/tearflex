import { create } from 'zustand';
import type { Me } from '@shared/types/user';

interface AuthState {
  me: Me | null;
  isAuthenticated: boolean;
  setMe: (me: Me) => void;
  setAuthenticated: (v: boolean) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  me: null,
  isAuthenticated: false,
  setMe: (me) => set({ me, isAuthenticated: true }),
  setAuthenticated: (v) => set(v ? { isAuthenticated: true } : { isAuthenticated: false, me: null }),
  clear: () => set({ me: null, isAuthenticated: false }),
}));
