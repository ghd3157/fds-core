"""
generate_synthetic_data.py — Sparkov 스키마 호환 KRW 합성 학습 데이터 생성기

Kaggle 대용량 CSV 없이도 즉시 LightGBM 학습·검증·데모가 가능하도록
Sparkov와 동일한 스키마(transactionId, userId, amount(KRW), merchantCategory,
transactionDate, latitude, longitude, is_fraud)의 현실적인 불균형 데이터셋을 생성한다.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

KST = ZoneInfo("Asia/Seoul")

NORMAL_CATEGORIES = [
    "grocery_pos", "food_dining", "gas_transport", "shopping_pos",
    "entertainment", "health_fitness", "home", "kids_pets",
    "personal_care", "shopping_net", "misc_pos", "travel",
]
NORMAL_CAT_PROBS = [0.16, 0.14, 0.12, 0.12, 0.08, 0.07, 0.07, 0.06, 0.06, 0.06, 0.04, 0.02]

FRAUD_ONLINE_CATEGORIES = ["shopping_net", "misc_net", "travel", "grocery_net"]
FRAUD_NIGHT_CATEGORIES = ["shopping_net", "misc_net", "gambling", "crypto", "atm_withdrawal"]


def generate_synthetic_dataset(n_samples: int = 60_000, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    base_time = datetime(2026, 11, 1, 0, 0, 0, tzinfo=KST)
    total_seconds = 14 * 24 * 3600  # 14일 구간

    n_users = 1200
    user_ids = [f"user-{1000 + i}" for i in range(n_users)]

    # 1. 정상 거래 (~98%)
    n_normal = int(n_samples * 0.98)
    normal_offsets = rng.integers(0, total_seconds, size=n_normal)
    normal_dates = [base_time + timedelta(seconds=int(s)) for s in normal_offsets]

    # 정상 시간대 가중치 조정 (새벽 비율을 자연스럽게 낮춤)
    adjusted_dates = []
    for dt in normal_dates:
        if dt.hour < 6 and rng.random() < 0.72:
            dt = dt.replace(hour=int(rng.integers(8, 23)))
        adjusted_dates.append(dt)

    normal_cats = rng.choice(NORMAL_CATEGORIES, size=n_normal, p=NORMAL_CAT_PROBS)
    normal_amounts = np.round(np.exp(rng.normal(loc=10.6, scale=0.85, size=n_normal)), -2)
    normal_amounts = np.clip(normal_amounts, 2_000, 1_100_000)

    # 소수의 정상 고액 거래 노이즈(여행/가전 등) 포함 → 과적합 방지
    high_norm_idx = rng.choice(n_normal, size=int(n_normal * 0.006), replace=False)
    normal_amounts[high_norm_idx] = np.round(rng.uniform(800_000, 1_450_000, size=len(high_norm_idx)), -3)

    rows: list[dict] = []
    for i in range(n_normal):
        rows.append({
            "transactionId": f"syn-norm-{i:06d}",
            "userId": user_ids[int(rng.integers(0, n_users))],
            "amount": float(normal_amounts[i]),
            "merchantCategory": str(normal_cats[i]),
            "transactionDate": adjusted_dates[i].isoformat(),
            "latitude": float(37.5665 + rng.normal(0, 0.35)),
            "longitude": float(126.9780 + rng.normal(0, 0.35)),
            "is_fraud": 0,
        })

    # 2. 이상(사기) 거래 (~2%): 고액 / 새벽 고위험 / 단시간 연타(Burst) / 복합 패턴
    n_fraud_target = n_samples - n_normal
    fraud_idx = 0

    # 2-A. 단시간 연타(Burst) 도용 클러스터 (~45% of fraud)
    burst_target = int(n_fraud_target * 0.45)
    while fraud_idx < burst_target:
        uid = user_ids[int(rng.integers(0, n_users))]
        cluster_len = int(rng.integers(3, 8))
        start_sec = int(rng.integers(0, total_seconds - 600))
        cat = str(rng.choice(FRAUD_ONLINE_CATEGORIES))
        lat = float(37.5665 + rng.normal(0, 0.4))
        lon = float(126.9780 + rng.normal(0, 0.4))

        for k in range(cluster_len):
            dt = base_time + timedelta(seconds=start_sec + k * int(rng.integers(5, 25)))
            amt = float(np.round(rng.uniform(180_000, 1_650_000), -2))
            rows.append({
                "transactionId": f"syn-fraud-{fraud_idx:06d}",
                "userId": uid,
                "amount": amt,
                "merchantCategory": cat,
                "transactionDate": dt.isoformat(),
                "latitude": lat,
                "longitude": lon,
                "is_fraud": 1,
            })
            fraud_idx += 1

    # 2-B. 새벽 고위험 업종 사기 (~30% of fraud)
    night_end = int(n_fraud_target * 0.75)
    while fraud_idx < night_end:
        day_offset = int(rng.integers(0, 14))
        dt = base_time + timedelta(
            days=day_offset,
            hours=int(rng.integers(0, 6)),
            minutes=int(rng.integers(0, 60)),
            seconds=int(rng.integers(0, 60)),
        )
        rows.append({
            "transactionId": f"syn-fraud-{fraud_idx:06d}",
            "userId": user_ids[int(rng.integers(0, n_users))],
            "amount": float(np.round(rng.uniform(280_000, 1_900_000), -2)),
            "merchantCategory": str(rng.choice(FRAUD_NIGHT_CATEGORIES)),
            "transactionDate": dt.isoformat(),
            "latitude": float(37.5665 + rng.normal(0, 0.5)),
            "longitude": float(126.9780 + rng.normal(0, 0.5)),
            "is_fraud": 1,
        })
        fraud_idx += 1

    # 2-C. 주간 고액 / 온라인 복합 패턴 사기 (~25% of fraud)
    while fraud_idx < n_fraud_target:
        dt = base_time + timedelta(seconds=int(rng.integers(0, total_seconds)))
        rows.append({
            "transactionId": f"syn-fraud-{fraud_idx:06d}",
            "userId": user_ids[int(rng.integers(0, n_users))],
            "amount": float(np.round(rng.uniform(950_000, 3_200_000), -3)),
            "merchantCategory": str(rng.choice(FRAUD_ONLINE_CATEGORIES)),
            "transactionDate": dt.isoformat(),
            "latitude": float(37.5665 + rng.normal(0, 0.5)),
            "longitude": float(126.9780 + rng.normal(0, 0.5)),
            "is_fraud": 1,
        })
        fraud_idx += 1

    df = pd.DataFrame(rows)
    return df.sort_values("transactionDate").reset_index(drop=True)
