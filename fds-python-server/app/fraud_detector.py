"""
fraud_detector.py — 3중 하이브리드 이상 탐지 오케스트레이터 + 실시간 PSI 드리프트 기록

FDS-DESIGN.md Section 10.2 기준:
- Layer 0: Redis ZSET 실시간 사용자 결제빈도 (1m / 10m / 1h, 이동거리 제외)
- Layer 1: 명시적 정책 룰 엔진 (R1~R4)
- Layer 2: LightGBM 지도학습 + TreeSHAP 피처별 기여도
- Layer 3: Isolation Forest 비지도 신종 이상탐지
- Hybrid 결합: 2개 이상 임계치 초과 시 HYBRID, 단일 초과 시 RULE/ML/ANOMALY, 미만 시 NONE
"""
from datetime import datetime
import logging
from typing import Literal

from app.config import settings
from app.drift_monitor import DataDriftMonitor
from app.feature_store import RedisFeatureStore
from app.features import KST, NIGHT_HOURS, build_online_feature_frame, parse_to_kst
from app.model_service import LightGBMModelService
from app.rule_engine import evaluate_rules
from app.schemas import FraudResultOutput, PaymentLogInput

logger = logging.getLogger(__name__)

DetectionSource = Literal["RULE", "ML", "ANOMALY", "HYBRID", "NONE"]


class HybridFraudDetector:
    def __init__(
        self,
        feature_store: RedisFeatureStore | None = None,
        model_service: LightGBMModelService | None = None,
        drift_monitor: DataDriftMonitor | None = None,
        threshold: float | None = None,
    ):
        self.feature_store = feature_store or RedisFeatureStore()
        self.model_service = model_service or LightGBMModelService()
        self.drift_monitor = drift_monitor or DataDriftMonitor()
        self.threshold = threshold if threshold is not None else settings.fraud_threshold

    def initialize(self) -> None:
        self.model_service.load()
        self.drift_monitor.set_baseline(self.model_service.metadata.get("drift_baseline"))

    def sync_drift_baseline(self) -> None:
        self.drift_monitor.set_baseline(self.model_service.metadata.get("drift_baseline"))

    def close(self) -> None:
        self.feature_store.close()

    def analyze(self, data: PaymentLogInput) -> FraudResultOutput:
        tx_kst = parse_to_kst(data.transactionDate)
        tx_epoch = tx_kst.timestamp()

        # 1. Redis 실시간 결제빈도 조회 및 기록 (1m / 10m / 1h)
        velocity = self.feature_store.record_and_get_velocity(
            user_id=data.userId,
            transaction_id=data.transactionId,
            tx_epoch_seconds=tx_epoch,
        )

        # 실시간 데이터 드리프트 윈도우에 기록
        self.drift_monitor.record(data.amount, velocity.tx_count_1m)

        # 2. 공용 전처리 (12개 피처)
        feature_df = build_online_feature_frame(
            data=data,
            tx_kst=tx_kst,
            tx_count_1m=velocity.tx_count_1m,
            tx_count_10m=velocity.tx_count_10m,
            tx_count_1h=velocity.tx_count_1h,
            vocab=self.model_service.category_vocab,
        )

        # 3. Layer 1 — Rule Engine 평가
        is_night = tx_kst.hour in NIGHT_HOURS
        rule_eval = evaluate_rules(
            amount=data.amount,
            merchant_category=data.merchantCategory,
            is_night=is_night,
            tx_count_1m=velocity.tx_count_1m,
            tx_count_10m=velocity.tx_count_10m,
        )

        # 4. Layer 2 (LightGBM) + Layer 3 (Isolation Forest) 추론
        pred = self.model_service.predict(feature_df)

        # 5. 3중 하이브리드 결합 정책
        rule_score = rule_eval.score
        ml_score = pred.ml_score
        anomaly_score = pred.anomaly_score
        final_score = round(max(rule_score or 0.0, ml_score or 0.0, anomaly_score or 0.0), 2)

        rule_hit = rule_score is not None and rule_score >= self.threshold
        ml_hit = ml_score is not None and ml_score >= self.threshold
        anom_hit = anomaly_score is not None and anomaly_score >= self.threshold

        hit_count = int(rule_hit) + int(ml_hit) + int(anom_hit)
        if hit_count >= 2:
            source: DetectionSource = "HYBRID"
        elif rule_hit:
            source = "RULE"
        elif ml_hit:
            source = "ML"
        elif anom_hit:
            source = "ANOMALY"
        else:
            source = "NONE"

        reason = self._build_reason(
            rule_hit=rule_hit,
            ml_hit=ml_hit,
            anom_hit=anom_hit,
            rule_reasons=rule_eval.reasons,
            ml_reason=pred.ml_reason,
            anomaly_score=anomaly_score,
        )
        analyzed_at = datetime.now(KST).isoformat(timespec="milliseconds")

        logger.info(
            "Fraud analysis complete | txId=%s | risk=%.2f | rule=%s | ml=%s | anom=%s | source=%s | vel=%d/%d/%d",
            data.transactionId, final_score, rule_score, ml_score, anomaly_score, source,
            velocity.tx_count_1m, velocity.tx_count_10m, velocity.tx_count_1h,
        )

        return FraudResultOutput(
            transactionId=data.transactionId,
            riskScore=final_score,
            ruleScore=rule_score,
            mlScore=ml_score,
            anomalyScore=anomaly_score,
            detectionSource=source,
            detectionReason=reason,
            shapContributions=pred.shap_contributions,
            txCount1m=velocity.tx_count_1m,
            txCount10m=velocity.tx_count_10m,
            txCount1h=velocity.tx_count_1h,
            analyzedAt=analyzed_at,
        )

    def _build_reason(
        self,
        *,
        rule_hit: bool,
        ml_hit: bool,
        anom_hit: bool,
        rule_reasons: list[str],
        ml_reason: str | None,
        anomaly_score: float | None,
    ) -> str:
        parts: list[str] = []
        if rule_hit and rule_reasons:
            parts.append(f"[RULE] {', '.join(rule_reasons)}")
        if ml_hit and ml_reason:
            parts.append(f"[ML] {ml_reason}")
        if anom_hit and anomaly_score is not None:
            parts.append(f"[ANOMALY] 비지도 신종 이상 패턴 감지 ({anomaly_score:.1f}점)")

        if not parts:
            return "정상 거래"
        return " | ".join(parts)[:500]
