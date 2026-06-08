import { create } from 'zustand'
import type { Me } from '@shared/types/user'

interface SessionState {
  me: Me | null
  setMe: (me: Me | null) => void
}

export const useSession = create<SessionState>((set) => ({
  me: null,
  setMe: (me) => set({ me }),
}))
