from pydantic import BaseModel, Field


class PaymentLogInput(BaseModel):
    """
    [Input] 수신 데이터 스키마 (Java -> Python via Kafka)
    Topic: payment-log-topic
    """
    transactionId: str
    userId: str
    amount: float
    merchantCategory: str
    transactionDate: str = Field(..., description="ISO-8601 형식의 거래 일시")
    latitude: float
    longitude: float


class FraudResultOutput(BaseModel):
    """
    [Output] 송신 데이터 스키마 (Python -> Java via Kafka)
    Topic: fraud-result-topic
    """
    transactionId: str = Field(..., description="원본 결제 번호")
    isFraud: bool = Field(..., description="AI 판별 결과 (사기 여부)")
    fraudScore: float = Field(..., ge=0.0, le=1.0, description="0.0 ~ 1.0 사이의 위험도 스코어")
    reason: str = Field(..., description='판별 근거 (예: "Abnormal location", "High amount")')
