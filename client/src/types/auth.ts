export type Role = 'admin' | 'landlord' | 'tenant'

export interface User {
  id: string
  email: string
  givenName: string
  lastName: string
  role: Role
  phone?: string
  createdAt: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  token: string
  refreshToken: string
  user: User
  message: string
}

export interface AuthState {
  user: User | null
  accessToken: string | null
  isAuthenticated: boolean
}
