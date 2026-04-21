import axios from 'axios'
import { useAuthStore } from '@/store/authStore'

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

// Attach access token from store to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

// On 401 — clear auth state and redirect to login
// Skip redirect on /dev/* routes (dev preview uses a fake token)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isDevRoute = window.location.pathname.startsWith('/dev')

    if (error.response?.status === 401 && !isDevRoute) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }

    return Promise.reject(error)
  }
)
