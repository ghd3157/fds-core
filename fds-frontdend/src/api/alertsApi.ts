import axiosInstance from './axiosInstance'
import type {
  CopilotReport,
  DetectionSource,
  FraudAlertItem,
  PageResponse,
  ReviewStatus,
} from '../types/fds'

export interface AlertQueryParams {
  page?: number
  size?: number
  reviewStatus?: ReviewStatus | ''
  detectionSource?: DetectionSource | ''
  sort?: string
}

export interface AlertReviewRequest {
  reviewStatus: 'CONFIRMED_FRAUD' | 'FALSE_POSITIVE'
  reviewNote?: string
}

export async function getAlerts(
  params: AlertQueryParams = {},
): Promise<PageResponse<FraudAlertItem>> {
  const query: Record<string, string | number> = {
    page: params.page ?? 0,
    size: params.size ?? 15,
    sort: params.sort ?? 'createdAt,desc',
  }
  if (params.reviewStatus) query.reviewStatus = params.reviewStatus
  if (params.detectionSource) query.detectionSource = params.detectionSource

  const res = await axiosInstance.get<PageResponse<FraudAlertItem>>('/alerts', {
    params: query,
  })
  return res.data
}

export async function getAlertDetail(alertId: number): Promise<FraudAlertItem> {
  const res = await axiosInstance.get<FraudAlertItem>(`/alerts/${alertId}`)
  return res.data
}

export async function reviewAlert(
  alertId: number,
  payload: AlertReviewRequest,
): Promise<FraudAlertItem> {
  const res = await axiosInstance.patch<FraudAlertItem>(
    `/alerts/${alertId}/review`,
    payload,
  )
  return res.data
}

export async function generateAiReport(alertId: number): Promise<CopilotReport> {
  const res = await axiosInstance.post<CopilotReport>(`/alerts/${alertId}/ai-report`)
  return res.data
}
