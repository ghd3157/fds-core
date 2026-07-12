import axios from 'axios'

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  accessToken: string
}

// POST /api/auth/login  (v1 prefix 없음 — 백엔드 경로 확인됨)
export async function login(data: LoginRequest): Promise<LoginResponse> {
  const response = await axios.post<LoginResponse>(
    'http://localhost:8080/api/auth/login',
    data,
    { headers: { 'Content-Type': 'application/json' } },
  )
  return response.data
}

