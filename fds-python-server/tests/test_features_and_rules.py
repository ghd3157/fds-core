import pandas as pd

from app.features import (
    FEATURE_COLUMNS,
    build_offline_feature_frame,
    build_online_feature_frame,
    compute_offline_velocity_features,
    parse_to_kst,
)
from app.rule_engine import evaluate_rules
from app.schemas import PaymentLogInput


def test_offline_velocity_matches_1m_10m_1h_windows():
    df = pd.DataFrame([
        # user-A: 10:00:00, 10:00:30 (1m 내 2회), 10:05:00 (10m 내 3회, 1m 내 1회), 10:40:00 (1h 내 4회)
        {"transactionId": "t1", "userId": "user-A", "amount": 10000, "merchantCategory": "food_dining",
         "transactionDate": "2026-11-22T10:00:00+09:00", "latitude": 37.5, "longitude": 127.0},
        {"transactionId": "t2", "userId": "user-A", "amount": 12000, "merchantCategory": "food_dining",
         "transactionDate": "2026-11-22T10:00:30+09:00", "latitude": 37.5, "longitude": 127.0},
        {"transactionId": "t3", "userId": "user-A", "amount": 15000, "merchantCategory": "food_dining",
         "transactionDate": "2026-11-22T10:05:00+09:00", "latitude": 37.5, "longitude": 127.0},
        {"transactionId": "t4", "userId": "user-A", "amount": 20000, "merchantCategory": "food_dining",
         "transactionDate": "2026-11-22T10:40:00+09:00", "latitude": 37.5, "longitude": 127.0},
        # user-B: 독립 집계 확인
        {"transactionId": "t5", "userId": "user-B", "amount": 30000, "merchantCategory": "grocery_pos",
         "transactionDate": "2026-11-22T10:00:40+09:00", "latitude": 37.5, "longitude": 127.0},
    ])

    enriched = compute_offline_velocity_features(df)

    assert list(enriched["tx_count_1m"]) == [1, 2, 1, 1, 1]
    assert list(enriched["tx_count_10m"]) == [1, 2, 3, 1, 1]
    assert list(enriched["tx_count_1h"]) == [1, 2, 3, 4, 1]


def test_online_and_offline_feature_frames_are_identical():
    payload = PaymentLogInput(
        transactionId="tx-skew-check",
        userId="user-99",
        amount=450000,
        merchantCategory="Shopping_Net",
        transactionDate="2026-11-22T02:30:00+09:00",
        latitude=37.5665,
        longitude=126.9780,
    )
    tx_kst = parse_to_kst(payload.transactionDate)
    online_df = build_online_feature_frame(payload, tx_kst, tx_count_1m=1, tx_count_10m=1, tx_count_1h=1)

    offline_raw = pd.DataFrame([payload.model_dump()])
    offline_df = build_offline_feature_frame(offline_raw)

    assert list(online_df.columns) == FEATURE_COLUMNS
    assert len(FEATURE_COLUMNS) == 12
    assert list(offline_df.columns) == FEATURE_COLUMNS
    pd.testing.assert_frame_equal(online_df, offline_df, check_dtype=False)


def test_rule_engine_all_four_rules_and_normal():
    # R1: 1분 내 5회 이상 → 95.0
    r1 = evaluate_rules(amount=50_000, merchant_category="grocery_pos", is_night=False, tx_count_1m=5, tx_count_10m=5)
    assert r1.score == 95.0
    assert any("1분 내 5회" in r for r in r1.reasons)

    # R2: 10분 내 12회 이상 → 88.0
    r2 = evaluate_rules(amount=50_000, merchant_category="grocery_pos", is_night=False, tx_count_1m=2, tx_count_10m=12)
    assert r2.score == 88.0

    # R3: 150만원 이상 → 90.0
    r3 = evaluate_rules(amount=1_500_000, merchant_category="travel", is_night=False, tx_count_1m=1, tx_count_10m=1)
    assert r3.score == 90.0

    # R4: 새벽 + 고위험 업종 + 30만원 이상 → 85.0
    r4 = evaluate_rules(amount=350_000, merchant_category="gambling", is_night=True, tx_count_1m=1, tx_count_10m=1)
    assert r4.score == 85.0

    # 복합 적중: R1(95) + R3(90) + R4(85) → 최고점 95.0, 사유 3건
    combo = evaluate_rules(amount=2_000_000, merchant_category="crypto", is_night=True, tx_count_1m=6, tx_count_10m=6)
    assert combo.score == 95.0
    assert len(combo.reasons) == 3

    # 정상 거래: 미적중
    normal = evaluate_rules(amount=45_000, merchant_category="grocery_pos", is_night=False, tx_count_1m=1, tx_count_10m=2)
    assert normal.score is None
    assert normal.reasons == []
