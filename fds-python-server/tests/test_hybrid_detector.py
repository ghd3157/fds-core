from pathlib import Path
from unittest.mock import MagicMock

from app.feature_store import VelocityFeatures
from app.fraud_detector import HybridFraudDetector
from app.kafka_client import KafkaPipelineWorker
from app.model_service import LightGBMModelService
from app.schemas import PaymentLogInput


def _make_stub_store(c1m: int = 1, c10m: int = 1, c1h: int = 1) -> MagicMock:
    store = MagicMock()
    store.record_and_get_velocity.return_value = VelocityFeatures(c1m, c10m, c1h)
    return store


def test_hybrid_detector_with_real_lgbm_model_classifies_normal_and_burst_fraud():
    model_service = LightGBMModelService()
    assert model_service.load() is True

    # 1. 정상 주간 장보기 결제
    normal_detector = HybridFraudDetector(
        feature_store=_make_stub_store(1, 1, 2),
        model_service=model_service,
    )
    normal_res = normal_detector.analyze(PaymentLogInput(
        transactionId="tx-normal-1",
        userId="user-1",
        amount=32_000,
        merchantCategory="grocery_pos",
        transactionDate="2026-11-22T14:20:00+09:00",
        latitude=37.5665,
        longitude=126.9780,
    ))
    assert normal_res.riskScore < 80.0
    assert normal_res.detectionSource == "NONE"
    assert normal_res.mlScore is not None

    # 2. 단시간 연타(1분 6회) + 고액 온라인 결제 → HYBRID 판정 + 한글 사유
    fraud_detector = HybridFraudDetector(
        feature_store=_make_stub_store(6, 7, 8),
        model_service=model_service,
    )
    fraud_res = fraud_detector.analyze(PaymentLogInput(
        transactionId="tx-burst-1",
        userId="user-2",
        amount=1_850_000,
        merchantCategory="shopping_net",
        transactionDate="2026-11-22T02:15:00+09:00",
        latitude=37.5665,
        longitude=126.9780,
    ))
    assert fraud_res.riskScore >= 80.0
    assert fraud_res.ruleScore == 95.0
    assert fraud_res.mlScore is not None and fraud_res.mlScore >= 80.0
    assert fraud_res.detectionSource == "HYBRID"
    assert "[RULE]" in fraud_res.detectionReason
    assert "[ML]" in fraud_res.detectionReason
    assert fraud_res.txCount1m == 6


def test_hybrid_detector_falls_back_to_rule_engine_when_model_missing(tmp_path: Path):
    missing_model_service = LightGBMModelService(
        model_path=tmp_path / "nonexistent.joblib",
        metadata_path=tmp_path / "nonexistent.json",
    )
    assert missing_model_service.load() is False

    detector = HybridFraudDetector(
        feature_store=_make_stub_store(5, 5, 5),
        model_service=missing_model_service,
    )
    res = detector.analyze(PaymentLogInput(
        transactionId="tx-fallback-1",
        userId="user-3",
        amount=120_000,
        merchantCategory="grocery_pos",
        transactionDate="2026-11-22T15:00:00+09:00",
    ))

    assert res.mlScore is None
    assert res.ruleScore == 95.0
    assert res.riskScore == 95.0
    assert res.detectionSource == "RULE"


def test_kafka_worker_routes_invalid_payload_to_dlq_and_requests_commit():
    detector = MagicMock()
    worker = KafkaPipelineWorker(detector)
    worker.send_to_dlq = MagicMock()

    should_commit = worker.process_raw_message(b'{"transactionId":"bad-tx","amount":-100}')

    assert should_commit is True
    worker.send_to_dlq.assert_called_once()
    detector.analyze.assert_not_called()
