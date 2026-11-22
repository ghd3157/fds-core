"""
features.py — 오프라인 학습 및 온라인 추론 공용 피처 엔지니어링 모듈

FDS-DESIGN.md Section 5.2 기준:
- 총 12개 피처 (이동거리 계산 제외, Redis 결제빈도 1m/10m/1h 중심)
- 학습과 서빙이 동일한 피처 순서와 인코딩 사전을 사용하여 Train-Serving Skew 방지
"""
from datetime import datetime
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

from app.schemas import PaymentLogInput

KST = ZoneInfo("Asia/Seoul")
NIGHT_HOURS = frozenset(range(0, 6))  # KST 새벽 0~5시

# Sparkov 14개 기본 카테고리 + 고위험 확장 카테고리 (미등록은 UNKNOWN=0)
CATEGORY_VOCAB: dict[str, int] = {
    "unknown": 0,
    "grocery_pos": 1,
    "grocery_net": 2,
    "shopping_pos": 3,
    "shopping_net": 4,
    "misc_pos": 5,
    "misc_net": 6,
    "gas_transport": 7,
    "food_dining": 8,
    "entertainment": 9,
    "travel": 10,
    "health_fitness": 11,
    "home": 12,
    "kids_pets": 13,
    "personal_care": 14,
    "gambling": 15,
    "crypto": 16,
    "adult": 17,
    "atm_withdrawal": 18,
}

FEATURE_COLUMNS: list[str] = [
    "amount",
    "log_amount",
    "merchant_category_id",
    "tx_hour",
    "tx_dow",
    "is_night",
    "is_weekend",
    "latitude",
    "longitude",
    "tx_count_1m",
    "tx_count_10m",
    "tx_count_1h",
]

FEATURE_KOREAN_LABELS: dict[str, str] = {
    "amount": "고액 결제",
    "log_amount": "고액 결제 패턴",
    "merchant_category_id": "고위험 업종",
    "tx_hour": "비정상 결제 시각",
    "tx_dow": "특이 요일 패턴",
    "is_night": "새벽 시간대 결제",
    "is_weekend": "주말 결제 패턴",
    "latitude": "특이 거래 위치",
    "longitude": "특이 거래 위치",
    "tx_count_1m": "1분 내 결제빈도 급증",
    "tx_count_10m": "10분 내 결제빈도 급증",
    "tx_count_1h": "1시간 내 결제빈도 급증",
}


def encode_category(category: str, vocab: dict[str, int] | None = None) -> int:
    mapping = vocab if vocab is not None else CATEGORY_VOCAB
    normalized = (category or "").lower().strip()
    return mapping.get(normalized, 0)


def parse_to_kst(ts_str: str) -> datetime:
    """ISO-8601 문자열을 KST aware datetime으로 변환한다."""
    ts = pd.to_datetime(ts_str, utc=True)
    return ts.tz_convert(KST).to_pydatetime()


def build_online_feature_frame(
    data: PaymentLogInput,
    tx_kst: datetime,
    tx_count_1m: int,
    tx_count_10m: int,
    tx_count_1h: int,
    vocab: dict[str, int] | None = None,
) -> pd.DataFrame:
    """단건 결제 로그 + Redis 결제빈도를 모델 입력용 1행 DataFrame(12개 피처)으로 변환한다."""
    tx_hour = tx_kst.hour
    tx_dow = tx_kst.weekday()  # 0=월 ~ 6=일
    is_night = 1 if tx_hour in NIGHT_HOURS else 0
    is_weekend = 1 if tx_dow >= 5 else 0

    lat = float(data.latitude) if data.latitude is not None else 37.5665
    lon = float(data.longitude) if data.longitude is not None else 126.9780

    row = {
        "amount": float(data.amount),
        "log_amount": float(np.log1p(data.amount)),
        "merchant_category_id": encode_category(data.merchantCategory, vocab),
        "tx_hour": tx_hour,
        "tx_dow": tx_dow,
        "is_night": is_night,
        "is_weekend": is_weekend,
        "latitude": lat,
        "longitude": lon,
        "tx_count_1m": int(max(1, tx_count_1m)),
        "tx_count_10m": int(max(1, tx_count_10m)),
        "tx_count_1h": int(max(1, tx_count_1h)),
    }
    return pd.DataFrame([row], columns=FEATURE_COLUMNS)


def compute_offline_velocity_features(df: pd.DataFrame) -> pd.DataFrame:
    """오프라인 학습 데이터셋에 Redis ZSET(1m/10m/1h)과 동일한 롤링 결제빈도 피처를 생성한다.

    요구 컬럼: userId, transactionDate (datetime64, tz-aware 또는 naive KST)
    주의: 사용자별 시간 오름차순 정렬 후 현재 건 포함 rolling window 카운트를 계산하여
          온라인 Redis ZCOUNT(tx_epoch - W, tx_epoch) 정의와 100% 일치시킨다.
    """
    work = df.copy()
    work["_orig_idx"] = np.arange(len(work))
    work["transactionDate"] = pd.to_datetime(work["transactionDate"], utc=True).dt.tz_convert(KST)
    work = work.sort_values(["userId", "transactionDate", "_orig_idx"]).reset_index(drop=True)

    # Pandas 2.x(ns) / 3.x(us) 단위 차이에 무관하게 정확한 epoch seconds 산출
    epochs = work["transactionDate"].dt.as_unit("s").astype("int64").to_numpy()
    users = work["userId"].to_numpy()

    n = len(work)
    c1m = np.ones(n, dtype=np.int32)
    c10m = np.ones(n, dtype=np.int32)
    c1h = np.ones(n, dtype=np.int32)

    start = 0
    while start < n:
        end = start + 1
        uid = users[start]
        while end < n and users[end] == uid:
            end += 1

        # 단일 사용자 구간 [start, end)에 대해 슬라이딩 포인터 3개 적용
        p1m = start
        p10m = start
        p1h = start
        for i in range(start, end):
            t = epochs[i]
            while epochs[p1m] < t - 60:
                p1m += 1
            while epochs[p10m] < t - 600:
                p10m += 1
            while epochs[p1h] < t - 3600:
                p1h += 1
            c1m[i] = i - p1m + 1
            c10m[i] = i - p10m + 1
            c1h[i] = i - p1h + 1

        start = end

    work["tx_count_1m"] = c1m
    work["tx_count_10m"] = c10m
    work["tx_count_1h"] = c1h

    # 원래 순서로 복원
    work = work.sort_values("_orig_idx").drop(columns=["_orig_idx"]).reset_index(drop=True)
    return work


def build_offline_feature_frame(df: pd.DataFrame, vocab: dict[str, int] | None = None) -> pd.DataFrame:
    """오프라인 DataFrame을 12개 모델 입력 피처로 변환한다."""
    enriched = compute_offline_velocity_features(df)
    dt = enriched["transactionDate"]

    out = pd.DataFrame(index=enriched.index)
    out["amount"] = enriched["amount"].astype(float)
    out["log_amount"] = np.log1p(out["amount"])
    out["merchant_category_id"] = enriched["merchantCategory"].map(lambda c: encode_category(str(c), vocab))
    out["tx_hour"] = dt.dt.hour.astype(int)
    out["tx_dow"] = dt.dt.dayofweek.astype(int)
    out["is_night"] = out["tx_hour"].isin(NIGHT_HOURS).astype(int)
    out["is_weekend"] = (out["tx_dow"] >= 5).astype(int)
    out["latitude"] = enriched["latitude"].fillna(37.5665).astype(float)
    out["longitude"] = enriched["longitude"].fillna(126.9780).astype(float)
    out["tx_count_1m"] = enriched["tx_count_1m"].astype(int)
    out["tx_count_10m"] = enriched["tx_count_10m"].astype(int)
    out["tx_count_1h"] = enriched["tx_count_1h"].astype(int)

    return out[FEATURE_COLUMNS]
