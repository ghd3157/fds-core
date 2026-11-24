from typing import Literal

from pydantic import BaseModel, Field


class PaymentLogInput(BaseModel):
    """
    [Input] 수신 데이터 스키마 (Spring Boot -> Python via Kafka: payment-log-topic)
    """
    transactionId: str = Field(..., min_length=1, max_length=100)
    userId: str = Field(..., min_length=1, max_length=100)
    amount: float = Field(..., gt=0.0, description="결제 금액 (KRW)")
    merchantCategory: str = Field(..., min_length=1, max_length=50)
    transactionDate: str = Field(..., description="ISO-8601 형식 거래 일시")
    latitude: float | None = Field(default=37.5665, ge=-90.0, le=90.0)
    longitude: float | None = Field(default=126.9780, ge=-180.0, le=180.0)


class ShapContribution(BaseModel):
    """피처별 TreeSHAP 기여도 (XAI 차트 시각화용)"""
    feature: str
    label: str
    value: float
    shap: float


class FraudResultOutput(BaseModel):
    """
    [Output] 송신 데이터 스키마 (Python -> Spring Boot via Kafka: fraud-result-topic)
    """
    transactionId: str = Field(..., description="원본 결제 번호")
    riskScore: float = Field(..., ge=0.0, le=100.0, description="최종 3중 하이브리드 위험 스코어 (0.0~100.0)")
    ruleScore: float | None = Field(default=None, ge=0.0, le=100.0, description="Layer 1: Rule Engine 점수")
    mlScore: float | None = Field(default=None, ge=0.0, le=100.0, description="Layer 2: LightGBM 지도학습 점수")
    anomalyScore: float | None = Field(default=None, ge=0.0, le=100.0, description="Layer 3: Isolation Forest 비지도 점수")
    detectionSource: Literal["RULE", "ML", "ANOMALY", "HYBRID", "NONE"] = Field(..., description="최종 탐지 출처")
    detectionReason: str = Field(..., max_length=500, description="규칙 및 TreeSHAP 기반 한글 탐지 사유")
    shapContributions: list[ShapContribution] = Field(default_factory=list, description="상위 피처별 TreeSHAP 기여도")
    txCount1m: int = Field(..., ge=1, description="최근 1분간 해당 사용자 결제 횟수")
    txCount10m: int = Field(..., ge=1, description="최근 10분간 해당 사용자 결제 횟수")
    txCount1h: int = Field(..., ge=1, description="최근 1시간 내 해당 사용자 결제 횟수")
    analyzedAt: str = Field(..., description="AI 분석 완료 시각 (ISO-8601 KST)")


class RecentTxContext(BaseModel):
    transactionId: str
    amount: float
    merchantCategory: str
    transactionDate: str
    isFraud: bool = False


class CopilotReportRequest(BaseModel):
    alertId: int
    transactionId: str
    userId: str
    amount: float
    merchantCategory: str
    transactionDate: str
    riskScore: float
    ruleScore: float | None = None
    mlScore: float | None = None
    anomalyScore: float | None = None
    detectionSource: str
    detectionReason: str
    txCount1m: int = 1
    shapContributions: list[ShapContribution] = Field(default_factory=list)
    recentTransactions: list[RecentTxContext] = Field(default_factory=list)


class CopilotReportResponse(BaseModel):
    alertId: int
    riskLevel: Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]
    summary: str
    recommendedActions: list[str]
    customerSmsDraft: str
    generator: str
    generatedAt: str


class FeedbackSample(BaseModel):
    transactionId: str
    userId: str
    amount: float = Field(..., gt=0.0)
    merchantCategory: str
    transactionDate: str
    latitude: float | None = 37.5665
    longitude: float | None = 126.9780
    label: int = Field(..., ge=0, le=1, description="1=CONFIRMED_FRAUD, 0=FALSE_POSITIVE")


class RetrainRequest(BaseModel):
    feedbackSamples: list[FeedbackSample] = Field(default_factory=list)
    forcePromote: bool = False


class RetrainResponse(BaseModel):
    promoted: bool
    reason: str
    previousVersion: str
    newVersion: str
    feedbackCount: int
    championMetrics: dict
    challengerMetrics: dict
    trainedAt: str
