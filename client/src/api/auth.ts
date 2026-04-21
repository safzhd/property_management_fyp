import { api } from '@/lib/axios'
import type { LoginRequest, LoginResponse, User } from '@/types/auth'

export async function loginUser(credentials: LoginRequest): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/login', credentials)
  return data
}

export async function logoutUser(): Promise<void> {
  await api.post('/auth/logout')
}

export async function getMe(): Promise<User> {
  const { data } = await api.get<{ user: User }>('/auth/me')
  return data.user
}
