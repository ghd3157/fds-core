export type UserRole = 'ROLE_ADMIN' | 'ROLE_VIEWER'

export interface UserProfile {
  username: string
  role: UserRole
}

export interface TokenResponse {
  accessToken: string
  refreshToken: string
  username: string
  role: UserRole
}

export type ProcessStatus = 'PENDING' | 'COMPLETE' | 'FAILED'
export type DetectionSource = 'RULE' | 'ML' | 'HYBRID'
export type ReviewStatus = 'UNCONFIRMED' | 'CONFIRMED_FRAUD' | 'FALSE_POSITIVE'

export interface DashboardSummary {
  todayFraudCount: number
  todayNormalCount: number
  todayTotalCount: number
  todayFraudRatio: number
  unconfirmedAlertCount: number
  pendingCount: number
  completeCount: number
}

export interface HourlyTraffic {
  hour: string
  label: string
  normalCount: number
  fraudCount: number
}

export interface CategoryStat {
  category: string
  count: number
}

export interface Transaction {
  id: number
  transactionId: string
  userId: string
  amount: number
  merchantCategory: string
  latitude: number | null
  longitude: number | null
  status: ProcessStatus
  isFraud: boolean
  riskScore: number | null
  detectionSource: DetectionSource | null
  reviewStatus: ReviewStatus | null
  createdAt: string
}

export interface FraudAlertItem {
  alertId: number
  transactionId: string
  userId: string
  amount: number
  merchantCategory: string
  latitude: number | null
  longitude: number | null
  transactionDate: string
  riskScore: number
  ruleScore: number | null
  mlScore: number | null
  detectionSource: DetectionSource
  detectionReason: string
  txCount1m: number
  reviewStatus: ReviewStatus
  reviewNote: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
}

export interface TransactionDetail {
  id: number
  transactionId: string
  userId: string
  amount: number
  merchantCategory: string
  latitude: number | null
  longitude: number | null
  status: ProcessStatus
  isFraud: boolean
  createdAt: string
  alert: FraudAlertItem | null
}

/** WebSocket STOMP /topic/alerts 통일 Payload (Spring AlertPayload 1:1 일치) */
export interface RealtimeAlertPayload {
  alertId: number
  transactionId: string
  userId: string
  amount: number
  merchantCategory: string
  riskScore: number
  ruleScore: number | null
  mlScore: number | null
  detectionSource: DetectionSource
  detectionReason: string
  txCount1m: number
  reviewStatus: ReviewStatus
  createdAt: string
}

export interface PageResponse<T> {
  content: T[]
  totalPages: number
  totalElements: number
  number: number
  size: number
}
