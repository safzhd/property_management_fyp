import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types/auth'

interface AuthStore {
  user: User | null
  accessToken: string | null
  isAuthenticated: boolean
  login: (user: User, accessToken: string) => void
  logout: () => void
  setUser: (user: User) => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,

      login: (user, accessToken) =>
        set({ user, accessToken, isAuthenticated: true }),

      logout: () =>
        set({ user: null, accessToken: null, isAuthenticated: false }),

      setUser: (user) => set({ user }),
    }),
    {
      name: 'propmanage-auth',
      // Only persist user — access token lives in memory between refreshes
      // For production you'd use refresh tokens via httpOnly cookie instead
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
