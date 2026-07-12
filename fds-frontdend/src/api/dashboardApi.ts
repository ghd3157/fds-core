import axiosInstance from './axiosInstance'

// --- 타입 정의 ---

export interface CategoryStat {
  category: string
  count: number
}

export type TransactionStatus = 'PENDING' | 'COMPLETE'

export interface Transaction {
  id: number
  transactionId: string
  amount: number
  category: string
  status: TransactionStatus
  isFraud: boolean
  createdAt: string
}

export interface PageResponse<T> {
  content: T[]
  totalPages: number
  totalElements: number
  number: number // 현재 페이지 (0-indexed)
}

export interface DashboardStats {
  todayFraudCount: number
  pendingCount: number
  completeCount: number
}

// --- API 함수 ---

// GET /api/v1/stats/fraud-by-category
export async function getFraudByCategory(): Promise<CategoryStat[]> {
  const res = await axiosInstance.get<CategoryStat[]>('/stats/fraud-by-category')
  return res.data
}

// GET /api/v1/stats/summary
export async function getDashboardStats(): Promise<DashboardStats> {
  const res = await axiosInstance.get<DashboardStats>('/stats/summary')
  return res.data
}

// GET /api/v1/transactions?page={page}&size={size}
export async function getTransactions(
  page: number,
  size: number = 10,
): Promise<PageResponse<Transaction>> {
  const res = await axiosInstance.get<PageResponse<Transaction>>('/transactions', {
    params: { page, size },
  })
  return res.data
}
