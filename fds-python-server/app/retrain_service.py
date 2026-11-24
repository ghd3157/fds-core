"""
retrain_service.py — Human-in-the-Loop(HITL) 피드백 반영 재학습 및 Champion–Challenger 무중단 핫스왑

FDS-DESIGN.md Section 10.2.D 기준:
- 관리자가 사기 확정(1)/오탐 처리(0)한 피드백 데이터를 가중 반영하여 Challenger 모델 학습
- 기존 Champion과 시계열 검증 PR-AUC 비교 후 기준 충족 시 아티팩트 교체 + 메모리 무중단 Hot-Swap
- 모든 재학습 시도는 models/history.json에 이력으로 영구 기록
"""
from datetime import datetime
import json
import logging
import threading
from typing import Any

import pandas as pd

from app.config import settings
from app.features import KST
from app.fraud_detector import HybridFraudDetector
from app.schemas import RetrainRequest, RetrainResponse
from training.generate_synthetic_data import generate_synthetic_dataset
from training.train_lgbm import save_artifacts, train_models_in_memory

logger = logging.getLogger(__name__)

_retrain_lock = threading.Lock()


def load_model_history() -> list[dict[str, Any]]:
    if not settings.history_path.exists():
        return []
    try:
        return json.loads(settings.history_path.read_text(encoding="utf-8"))
    except Exception:
        return []


def _next_version(current_version: str) -> str:
    stamp = datetime.now(KST).strftime("%Y%m%d-%H%M%S")
    return f"lgbm-iforest-v{stamp}"


def execute_retrain(req: RetrainRequest, detector: HybridFraudDetector) -> RetrainResponse:
    with _retrain_lock:
        champion_meta = detector.model_service.metadata
        prev_version = detector.model_service.model_version
        champion_metrics = champion_meta.get("metrics", {})
        champion_pr_auc = float(champion_metrics.get("pr_auc", 0.0))

        # 1. 기본 데이터셋 + 관리자 피드백 DataFrame 준비
        base_df = generate_synthetic_dataset(n_samples=30_000, seed=42)
        feedback_df: pd.DataFrame | None = None
        if req.feedbackSamples:
            feedback_df = pd.DataFrame([
                {
                    "transactionId": f.transactionId,
                    "userId": f.userId,
                    "amount": float(f.amount),
                    "merchantCategory": f.merchantCategory.lower().strip(),
                    "transactionDate": f.transactionDate,
                    "latitude": f.latitude if f.latitude is not None else 37.5665,
                    "longitude": f.longitude if f.longitude is not None else 126.9780,
                    "is_fraud": int(f.label),
                }
                for f in req.feedbackSamples
            ])

        new_version = _next_version(prev_version)
        dataset_source = f"hitl-retrain(base=30000, feedback={len(req.feedbackSamples)})"

        # 2. Challenger 모델(LightGBM + IsolationForest) 학습 및 검증
        challenger_lgbm, challenger_iforest, challenger_meta = train_models_in_memory(
            df=base_df,
            dataset_source=dataset_source,
            model_version=new_version,
            feedback_df=feedback_df,
            feedback_weight=12.0,
        )
        challenger_metrics = challenger_meta["metrics"]
        challenger_pr_auc = float(challenger_metrics.get("pr_auc", 0.0))

        # 3. Champion vs Challenger 승격 판정 (열화 허용 오차 0.01 이내 또는 강제 승격)
        promoted = req.forcePromote or (challenger_pr_auc >= champion_pr_auc - 0.01)

        if promoted:
            reason = (
                f"Challenger PR-AUC({challenger_pr_auc:.4f})가 Champion({champion_pr_auc:.4f}) 기준을 충족하여 "
                "무중단 Hot-Swap 승격 완료"
            )
            save_artifacts(
                challenger_lgbm,
                challenger_iforest,
                challenger_meta,
                settings.model_path,
                settings.iforest_path,
                settings.metadata_path,
                settings.history_path,
                promoted=True,
                note=f"HITL 피드백 {len(req.feedbackSamples)}건 반영 승격",
            )
            detector.model_service.hot_swap(challenger_lgbm, challenger_iforest, challenger_meta)
            detector.sync_drift_baseline()
        else:
            reason = (
                f"Challenger PR-AUC({challenger_pr_auc:.4f})가 Champion({champion_pr_auc:.4f})보다 낮아 "
                "기존 Champion 모델을 유지합니다."
            )
            # 이력만 기록하고 아티팩트는 유지
            history = load_model_history()
            history.insert(0, {
                "version": new_version,
                "trainedAt": challenger_meta["trained_at"],
                "datasetSource": dataset_source,
                "feedbackSamples": len(req.feedbackSamples),
                "promoted": False,
                "note": reason,
                "metrics": challenger_metrics,
            })
            settings.history_path.parent.mkdir(parents=True, exist_ok=True)
            settings.history_path.write_text(
                json.dumps(history[:20], ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

        logger.info("HITL Retrain finished | promoted=%s | version=%s | feedback=%d",
                    promoted, new_version, len(req.feedbackSamples))

        return RetrainResponse(
            promoted=promoted,
            reason=reason,
            previousVersion=prev_version,
            newVersion=new_version if promoted else prev_version,
            feedbackCount=len(req.feedbackSamples),
            championMetrics=champion_metrics,
            challengerMetrics=challenger_metrics,
            trainedAt=challenger_meta["trained_at"],
        )
