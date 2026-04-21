import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,   // data stays fresh for 5 minutes
      retry: (failureCount, error: unknown) => {
        // Don't retry on 401 or 403
        const status = (error as { response?: { status: number } })?.response?.status
        if (status === 401 || status === 403) return false
        return failureCount < 2
      },
    },
  },
})
