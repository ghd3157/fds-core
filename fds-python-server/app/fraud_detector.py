"""
fraud_detector.py — 3-Layer 하이브리드 이상 탐지 오케스트레이터

FDS-DESIGN.md Section 5.5 기준:
- Layer 0: Redis ZSET 실시간 사용자 결제빈도 (1m / 10m / 1h, 이동거리 제외)
- Layer 1: 명시적 정책 룰 엔진 (R1~R4)
- Layer 2: LightGBM 실시간 추론 + TreeSHAP 기여 피처 사유 생성
- Layer 3: Hybrid Score 결합 (final = max(ruleScore, mlScore), threshold = 80.0)
"""
import logging
from datetime import datetime
from typing import Literal

from app.config import settings
from app.feature_store import RedisFeatureStore
from app.features import NIGHT_HOURS, KST, build_online_feature_frame, parse_to_kst
from app.model_service import LightGBMModelService
from app.rule_engine import evaluate_rules
from app.schemas import FraudResultOutput, PaymentLogInput

logger = logging.getLogger(__name__)

DetectionSource = Literal["RULE", "ML", "HYBRID", "NONE"]


class HybridFraudDetector:
    def __init__(
        self,
        feature_store: RedisFeatureStore | None = None,
        model_service: LightGBMModelService | None = None,
        threshold: float | None = None,
    ):
        self.feature_store = feature_store or RedisFeatureStore()
        self.model_service = model_service or LightGBMModelService()
        self.threshold = threshold if threshold is not None else settings.fraud_threshold

    def initialize(self) -> None:
        self.model_service.load()

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

        # 4. Layer 2 — LightGBM 추론 (모델 미로드 시 None Fallback)
        ml_pred = self.model_service.predict(feature_df)

        # 5. Layer 3 — Hybrid 결합 정책
        rule_score = rule_eval.score
        ml_score = ml_pred.score
        final_score = round(max(rule_score or 0.0, ml_score or 0.0), 2)

        rule_hit = rule_score is not None and rule_score >= self.threshold
        ml_hit = ml_score is not None and ml_score >= self.threshold

        if rule_hit and ml_hit:
            source: DetectionSource = "HYBRID"
        elif rule_hit:
            source = "RULE"
        elif ml_hit:
            source = "ML"
        else:
            source = "NONE"

        reason = self._build_reason(source, rule_eval.reasons, ml_pred.reason)
        analyzed_at = datetime.now(KST).isoformat(timespec="milliseconds")

        logger.info(
            "Fraud analysis complete | txId=%s | risk=%.2f | rule=%s | ml=%s | source=%s | vel=%d/%d/%d",
            data.transactionId, final_score, rule_score, ml_score, source,
            velocity.tx_count_1m, velocity.tx_count_10m, velocity.tx_count_1h,
        )

        return FraudResultOutput(
            transactionId=data.transactionId,
            riskScore=final_score,
            ruleScore=rule_score,
            mlScore=ml_score,
            detectionSource=source,
            detectionReason=reason,
            txCount1m=velocity.tx_count_1m,
            txCount10m=velocity.tx_count_10m,
            txCount1h=velocity.tx_count_1h,
            analyzedAt=analyzed_at,
        )

    def _build_reason(
        self,
        source: DetectionSource,
        rule_reasons: list[str],
        ml_reason: str | None,
    ) -> str:
        parts: list[str] = []
        if rule_reasons:
            parts.append(f"[RULE] {', '.join(rule_reasons)}")
        if source in ("ML", "HYBRID") and ml_reason:
            parts.append(f"[ML] {ml_reason}")

        if not parts:
            return "정상 거래"

        joined = " | ".join(parts)
        return joined[:500]
