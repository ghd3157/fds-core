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
    # UTC → KST(Asia/Seoul, UTC+9) 변환: .dt.hour가 한국 현지시각 기준이 되도록 한다.
    df["transactionDate"] = df["transactionDate"].dt.tz_convert("Asia/Seoul")
    df["transaction_hour"] = df["transactionDate"].dt.hour
    df["transaction_dow"]  = df["transactionDate"].dt.dayofweek
    df["is_night"]         = df["transaction_hour"].isin(NIGHT_HOURS)

    return df


# --------------------------------------------------------------------------- #
# 더미 규칙 엔진 (Step 4: 이 블록을 모델 추론으로 교체)
# --------------------------------------------------------------------------- #

def _apply_rules(df: pd.DataFrame) -> tuple[float, str]:
    """규칙 기반으로 (riskScore, fraudReason) 을 반환한다.

    riskScore는 Spring 스펙에 맞춰 0.0 ~ 100.0 스케일로 반환한다.
    우선순위: 높은 금액 > 새벽 고위험 업종 > 정상
    """
    row = df.iloc[0]

    if row["amount"] >= HIGH_AMOUNT_THRESHOLD:
        raw   = min(0.5 + (row["amount"] - HIGH_AMOUNT_THRESHOLD) / HIGH_AMOUNT_THRESHOLD * 0.4, 0.95)
        score = round(raw * 100, 2)  # 0~1 → 0~100
        return score, f"High amount: {row['amount']:.2f}"

    if row["is_night"] and row["merchantCategory"] in HIGH_RISK_NIGHT_CATEGORIES:
        return 82.0, f"Night-hour transaction in high-risk category: {row['merchantCategory']}"

    return 5.0, "Normal transaction"


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
    score, reason = _apply_rules(df)

    logger.info(
        "Fraud analysis done - transactionId=%s riskScore=%.2f reason=%r",
        data.transactionId, score, reason,
    )

    return FraudResultOutput(
        transactionId=data.transactionId,
        riskScore=score,
        fraudReason=reason,
    )
