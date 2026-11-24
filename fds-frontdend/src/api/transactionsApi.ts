import axiosInstance from './axiosInstance'
import type {
  PageResponse,
  ProcessStatus,
  Transaction,
  TransactionDetail,
} from '../types/fds'

export interface TransactionQueryParams {
  page?: number
  size?: number
  status?: ProcessStatus | ''
  isFraud?: boolean | ''
  category?: string
  keyword?: string
}

export async function getTransactions(
  params: TransactionQueryParams = {},
): Promise<PageResponse<Transaction>> {
  const query: Record<string, string | number | boolean> = {
    page: params.page ?? 0,
    size: params.size ?? 10,
  }
  if (params.status) query.status = params.status
  if (params.isFraud !== '' && params.isFraud !== undefined) query.isFraud = params.isFraud
  if (params.category?.trim()) query.category = params.category.trim()
  if (params.keyword?.trim()) query.keyword = params.keyword.trim()

  const res = await axiosInstance.get<PageResponse<Transaction>>('/transactions', {
    params: query,
  })
  return res.data
}

export async function getTransactionDetail(
  transactionId: string,
): Promise<TransactionDetail> {
  const res = await axiosInstance.get<TransactionDetail>(
    `/transactions/${encodeURIComponent(transactionId)}`,
  )
  return res.data
}
