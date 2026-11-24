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
export type DetectionSource = 'RULE' | 'ML' | 'ANOMALY' | 'HYBRID'
export type ReviewStatus = 'UNCONFIRMED' | 'CONFIRMED_FRAUD' | 'FALSE_POSITIVE'

export interface ShapContribution {
  feature: string
  label: string
  value: number
  shap: number
}

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
  anomalyScore: number | null
  detectionSource: DetectionSource
  detectionReason: string
  shapContributions: ShapContribution[]
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
  anomalyScore: number | null
  detectionSource: DetectionSource
  detectionReason: string
  txCount1m: number
  reviewStatus: ReviewStatus
  createdAt: string
}

export interface CopilotReport {
  alertId: number
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  summary: string
  recommendedActions: string[]
  customerSmsDraft: string
  generator: string
  generatedAt: string
}

export interface ConfusionMatrix {
  tn: number
  fp: number
  fn: number
  tp: number
}

export interface ModelMetrics {
  pr_auc?: number
  roc_auc?: number
  f1_at_0_80?: number
  f1_at_0_50?: number
  recall_at_fpr_1pct?: number
  iforest_roc_auc?: number
  confusion_matrix_at_0_80?: ConfusionMatrix
}

export interface DriftStatus {
  psiScore: number
  amountPsi: number
  velocityPsi: number
  status: 'NORMAL' | 'WARNING' | 'DRIFT'
  sampleCount: number
  minSamplesRequired: number
  message: string
}

export interface FeedbackSummary {
  confirmedFraudCount: number
  falsePositiveCount: number
  unconfirmedCount: number
  totalFeedbackCount: number
}

export interface ModelHistoryEntry {
  version: string
  trainedAt: string
  datasetSource: string
  feedbackSamples: number
  promoted: boolean
  note: string
  metrics: ModelMetrics
}

export interface ModelStatusResponse {
  modelLoaded: boolean
  iforestLoaded: boolean
  modelVersion: string
  trainedAt: string | null
  datasetSource: string | null
  trainSamples: number
  testSamples: number
  feedbackSamples: number
  metrics: ModelMetrics
  drift: DriftStatus
  feedbackSummary: FeedbackSummary
  history: ModelHistoryEntry[]
}

export interface RetrainResponse {
  promoted: boolean
  reason: string
  previousVersion: string
  newVersion: string
  feedbackCount: number
  championMetrics: ModelMetrics
  challengerMetrics: ModelMetrics
  trainedAt: string
}

export interface PageResponse<T> {
  content: T[]
  totalPages: number
  totalElements: number
  number: number
  size: number
}
