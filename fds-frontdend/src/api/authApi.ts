import axios from 'axios'
import axiosInstance, { API_BASE_URL } from './axiosInstance'
import type { TokenResponse, UserProfile } from '../types/fds'

export interface LoginRequest {
  username: string
  password: string
}

export async function login(data: LoginRequest): Promise<TokenResponse> {
  const response = await axios.post<TokenResponse>(
    `${API_BASE_URL}/auth/login`,
    data,
    { headers: { 'Content-Type': 'application/json' } },
  )
  return response.data
}

export async function logout(): Promise<void> {
  try {
    await axiosInstance.post('/auth/logout')
  } finally {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
  }
}

export async function getMe(): Promise<UserProfile> {
  const response = await axiosInstance.get<UserProfile>('/auth/me')
  return response.data
}
