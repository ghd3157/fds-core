from unittest.mock import MagicMock

from app.copilot_service import generate_incident_report
from app.drift_monitor import DataDriftMonitor
from app.feature_store import VelocityFeatures
from app.fraud_detector import HybridFraudDetector
from app.model_service import LightGBMModelService
from app.schemas import (
    CopilotReportRequest,
    PaymentLogInput,
    ShapContribution,
)


def test_three_layer_ensemble_returns_anomaly_score_and_shap_contributions():
    model_service = LightGBMModelService()
    assert model_service.load() is True
    assert model_service.is_iforest_loaded is True

    store = MagicMock()
    store.record_and_get_velocity.return_value = VelocityFeatures(6, 6, 8)
    detector = HybridFraudDetector(feature_store=store, model_service=model_service)

    res = detector.analyze(PaymentLogInput(
        transactionId="tx-p5-ensemble",
        userId="user-p5",
        amount=2_200_000,
        merchantCategory="shopping_net",
        transactionDate="2026-11-24T02:10:00+09:00",
        latitude=37.5665,
        longitude=126.9780,
    ))

    assert res.ruleScore == 95.0
    assert res.mlScore is not None and res.mlScore >= 80.0
    assert res.anomalyScore is not None and res.anomalyScore >= 50.0
    assert res.detectionSource == "HYBRID"
    assert len(res.shapContributions) == 6
    assert all(isinstance(c, ShapContribution) for c in res.shapContributions)


def test_psi_drift_monitor_detects_distribution_shift():
    monitor = DataDriftMonitor(window_size=100, min_samples=10)
    monitor.set_baseline({
        "amount_edges": [0.0, 50_000.0, 150_000.0, 500_000.0, 1e9],
        "amount_ratios": [0.5, 0.35, 0.12, 0.03],
        "velocity_edges": [0.0, 1.5, 2.5, 4.5, 10.5, 1e6],
        "velocity_ratios": [0.90, 0.06, 0.02, 0.015, 0.005],
    })

    # 극단적 고액·연타 분포 주입 → DRIFT 상태
    for _ in range(20):
        monitor.record(amount=3_000_000.0, tx_count_1m=8)

    status = monitor.get_status()
    assert status["status"] == "DRIFT"
    assert status["psiScore"] >= 0.25
    assert status["sampleCount"] == 20


def test_copilot_report_generates_structured_korean_briefing():
    req = CopilotReportRequest(
        alertId=101,
        transactionId="tx-copilot-1",
        userId="user-777",
        amount=1_950_000,
        merchantCategory="shopping_net",
        transactionDate="2026-11-24T02:30:00+09:00",
        riskScore=96.5,
        ruleScore=95.0,
        mlScore=96.5,
        anomalyScore=88.2,
        detectionSource="HYBRID",
        detectionReason="[RULE] 단시간 다중 결제 (1분 내 6회)",
        txCount1m=6,
        shapContributions=[
            ShapContribution(feature="tx_count_1m", label="1분 내 결제빈도 급증", value=6.0, shap=3.4),
            ShapContribution(feature="amount", label="고액 결제", value=1_950_000.0, shap=2.1),
        ],
    )

    report = generate_incident_report(req)
    assert report.alertId == 101
    assert report.riskLevel == "CRITICAL"
    assert "user-777" in report.summary
    assert len(report.recommendedActions) >= 3
    assert "1,950,000원" in report.customerSmsDraft
