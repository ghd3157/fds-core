from typing import Literal

from pydantic import BaseModel, Field


class PaymentLogInput(BaseModel):
    """
    [Input] 수신 데이터 스키마 (Spring Boot -> Python via Kafka: payment-log-topic)
    FDS-DESIGN.md Section 4.2 계약 기준
    """
    transactionId: str = Field(..., min_length=1, max_length=100)
    userId: str = Field(..., min_length=1, max_length=100)
    amount: float = Field(..., gt=0.0, description="결제 금액 (KRW)")
    merchantCategory: str = Field(..., min_length=1, max_length=50)
    transactionDate: str = Field(..., description="ISO-8601 형식 거래 일시")
    latitude: float | None = Field(default=37.5665, ge=-90.0, le=90.0)
    longitude: float | None = Field(default=126.9780, ge=-180.0, le=180.0)


class FraudResultOutput(BaseModel):
    """
    [Output] 송신 데이터 스키마 (Python -> Spring Boot via Kafka: fraud-result-topic)
    FDS-DESIGN.md Section 4.2 계약 기준
    """
    transactionId: str = Field(..., description="원본 결제 번호")
    riskScore: float = Field(..., ge=0.0, le=100.0, description="최종 하이브리드 위험 스코어 (0.0~100.0)")
    ruleScore: float | None = Field(default=None, ge=0.0, le=100.0, description="Rule Engine 점수")
    mlScore: float | None = Field(default=None, ge=0.0, le=100.0, description="LightGBM 추론 점수")
    detectionSource: Literal["RULE", "ML", "HYBRID", "NONE"] = Field(..., description="최종 탐지 출처")
    detectionReason: str = Field(..., max_length=500, description="규칙 및 TreeSHAP 기반 한글 탐지 사유")
    txCount1m: int = Field(..., ge=1, description="최근 1분간 해당 사용자 결제 횟수")
    txCount10m: int = Field(..., ge=1, description="최근 10분간 해당 사용자 결제 횟수")
    txCount1h: int = Field(..., ge=1, description="최근 1시간 내 해당 사용자 결제 횟수")
    analyzedAt: str = Field(..., description="AI 분석 완료 시각 (ISO-8601 KST)")
