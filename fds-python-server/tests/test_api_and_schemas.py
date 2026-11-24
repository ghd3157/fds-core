import os
from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError

os.environ["FDS_DISABLE_KAFKA"] = "true"

from app import main as app_main  # noqa: E402
from app.feature_store import VelocityFeatures  # noqa: E402
from app.schemas import FraudResultOutput, PaymentLogInput  # noqa: E402


def test_health_and_predict_endpoints_and_schema_validation():
    mock_store = MagicMock()
    mock_store.ping.return_value = True
    mock_store.record_and_get_velocity.return_value = VelocityFeatures(1, 1, 1)
    app_main.detector.feature_store = mock_store
    app_main.detector.initialize()

    # 1. /health 응답 계약 검증
    health = app_main.health_check()
    assert health["status"] == "ok"
    assert health["modelLoaded"] is True
    assert health["modelVersion"].startswith("lgbm-iforest-")
    assert health["iforestLoaded"] is True
    assert health["redisConnected"] is True

    # 2. /api/v1/predict 정상 추론 및 v2.0 출력 스키마 검증
    req = PaymentLogInput(
        transactionId="tx-api-1",
        userId="user-100",
        amount=2_000_000,
        merchantCategory="shopping_net",
        transactionDate="2026-11-22T02:00:00+09:00",
        latitude=37.5665,
        longitude=126.9780,
    )
    res = app_main.predict_sync(req)
    assert isinstance(res, FraudResultOutput)
    dumped = res.model_dump()
    assert dumped["transactionId"] == "tx-api-1"
    assert dumped["riskScore"] >= 80.0
    assert dumped["detectionSource"] in ("RULE", "ML", "HYBRID")
    assert dumped["detectionReason"]
    assert dumped["analyzedAt"]

    # 3. 음수 금액 입력 검증 실패 (Pydantic ValidationError)
    with pytest.raises(ValidationError):
        PaymentLogInput(
            transactionId="tx-api-bad",
            userId="user-100",
            amount=-50,
            merchantCategory="food",
            transactionDate="2026-11-22T02:00:00+09:00",
        )
