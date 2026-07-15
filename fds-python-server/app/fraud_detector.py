"""
fraud_detector.py — Step 3: 전처리 파이프라인 & 더미 AI 추론

[Step 4] 실제 ML/DL 모델 연동 시 analyze_fraud_risk() 내부만 교체하면 된다.
"""
import logging

import pandas as pd

from app.schemas import FraudResultOutput, PaymentLogInput

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# 규칙 기반 임계값 (Step 4에서 모델로 대체)
# --------------------------------------------------------------------------- #

HIGH_AMOUNT_THRESHOLD = 5_000.0          # 이 금액 이상이면 고위험으로 분류
NIGHT_HOURS = set(range(0, 6))           # 새벽 0~5시
HIGH_RISK_NIGHT_CATEGORIES = {           # 새벽 시간대에 고위험으로 분류할 업종
    "gambling", "crypto", "adult", "atm_withdrawal",
}


# --------------------------------------------------------------------------- #
# 전처리
# --------------------------------------------------------------------------- #

def _preprocess(data: PaymentLogInput) -> pd.DataFrame:
    """PaymentLogInput → Pandas DataFrame 변환 및 파생 변수 생성.

    생성되는 파생 컬럼:
        - transaction_hour  : 거래 시각(시)
        - transaction_dow   : 거래 요일(0=월 ~ 6=일)
        - is_night          : 새벽(0~5시) 여부
    """
    df = pd.DataFrame([{
        "transactionId":    data.transactionId,
        "userId":           data.userId,
        "amount":           data.amount,
        "merchantCategory": data.merchantCategory.lower().strip(),
        "transactionDate":  data.transactionDate,
        "latitude":         data.latitude,
        "longitude":        data.longitude,
    }])

    df["transactionDate"] = pd.to_datetime(df["transactionDate"], utc=True)
    df["transaction_hour"] = df["transactionDate"].dt.hour
    df["transaction_dow"]  = df["transactionDate"].dt.dayofweek
    df["is_night"]         = df["transaction_hour"].isin(NIGHT_HOURS)

    return df


# --------------------------------------------------------------------------- #
# 더미 규칙 엔진 (Step 4: 이 블록을 모델 추론으로 교체)
# --------------------------------------------------------------------------- #

def _apply_rules(df: pd.DataFrame) -> tuple[bool, float, str]:
    """규칙 기반으로 (isFraud, fraudScore, reason) 을 반환한다.

    우선순위: 높은 금액 > 새벽 고위험 업종 > 정상
    """
    row = df.iloc[0]

    if row["amount"] >= HIGH_AMOUNT_THRESHOLD:
        score  = min(0.5 + (row["amount"] - HIGH_AMOUNT_THRESHOLD) / HIGH_AMOUNT_THRESHOLD * 0.4, 0.95)
        return True, round(score, 4), f"High amount: {row['amount']:.2f}"

    if row["is_night"] and row["merchantCategory"] in HIGH_RISK_NIGHT_CATEGORIES:
        return True, 0.82, f"Night-hour transaction in high-risk category: {row['merchantCategory']}"

    return False, 0.05, "Normal transaction"


# --------------------------------------------------------------------------- #
# 공개 인터페이스 — kafka_client.py 에서 호출
# --------------------------------------------------------------------------- #

def analyze_fraud_risk(data: PaymentLogInput) -> FraudResultOutput:
    """결제 로그를 전처리 → 규칙 적용 → FraudResultOutput 반환.

    Step 4 연동 포인트:
        _apply_rules() 를 모델 추론 함수로 교체하거나,
        df 를 feature matrix로 변환하여 model.predict() 를 호출한다.
    """
    df = _preprocess(data)
    is_fraud, score, reason = _apply_rules(df)

    logger.info(
        "Fraud analysis done - transactionId=%s isFraud=%s score=%.4f reason=%r",
        data.transactionId, is_fraud, score, reason,
    )

    return FraudResultOutput(
        transactionId=data.transactionId,
        isFraud=is_fraud,
        fraudScore=score,
        reason=reason,
    )
