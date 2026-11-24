"""
model_service.py — Layer 2 (LightGBM 지도) + Layer 3 (Isolation Forest 비지도) 통합 서빙 & 무중단 Hot-Swap

FDS-DESIGN.md Section 10.2 기준:
- LightGBM: predict_proba (0~100) + 내장 TreeSHAP(pred_contrib=True) 피처별 기여도 상위 6개 추출
- Isolation Forest: 정상 거래 분포 대비 신종 이상 점수(anomalyScore 0~100) 산출
- threading.RLock으로 실행 중 무중단 모델 핫스왑(reload) 안전성 보장
"""
from dataclasses import dataclass, field
import json
import logging
from pathlib import Path
import threading
from typing import Any

import joblib
import numpy as np
import pandas as pd

from app.config import settings
from app.features import CATEGORY_VOCAB, FEATURE_COLUMNS, FEATURE_KOREAN_LABELS
from app.schemas import ShapContribution

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ModelPrediction:
    ml_score: float | None
    anomaly_score: float | None
    ml_reason: str | None
    shap_contributions: list[ShapContribution] = field(default_factory=list)


class LightGBMModelService:
    def __init__(
        self,
        model_path: Path | None = None,
        iforest_path: Path | None = None,
        metadata_path: Path | None = None,
    ):
        self._model_path = model_path or settings.model_path
        self._iforest_path = iforest_path or settings.iforest_path
        self._metadata_path = metadata_path or settings.metadata_path
        self._lock = threading.RLock()

        self._model: Any = None
        self._iforest: Any = None
        self._metadata: dict[str, Any] = {}
        self._vocab: dict[str, int] = dict(CATEGORY_VOCAB)
        self._feature_names: list[str] = list(FEATURE_COLUMNS)
        self._iforest_p05: float = -0.15
        self._iforest_p995: float = 0.15

    @property
    def is_loaded(self) -> bool:
        with self._lock:
            return self._model is not None

    @property
    def is_iforest_loaded(self) -> bool:
        with self._lock:
            return self._iforest is not None

    @property
    def model_version(self) -> str:
        with self._lock:
            return str(self._metadata.get("model_version", "unloaded"))

    @property
    def metadata(self) -> dict[str, Any]:
        with self._lock:
            return dict(self._metadata)

    @property
    def category_vocab(self) -> dict[str, int]:
        with self._lock:
            return dict(self._vocab)

    def load(self) -> bool:
        with self._lock:
            if not self._model_path.exists():
                logger.warning(
                    "LightGBM model artifact not found at %s (Rule-Engine fallback mode)",
                    self._model_path,
                )
                self._model = None
                self._iforest = None
                return False

            try:
                loaded_lgbm = joblib.load(self._model_path)
                loaded_iforest = joblib.load(self._iforest_path) if self._iforest_path.exists() else None
                loaded_meta: dict[str, Any] = {}
                if self._metadata_path.exists():
                    loaded_meta = json.loads(self._metadata_path.read_text(encoding="utf-8"))

                self._model = loaded_lgbm
                self._iforest = loaded_iforest
                self._metadata = loaded_meta
                if "category_vocab" in loaded_meta:
                    self._vocab = loaded_meta["category_vocab"]
                if "feature_names" in loaded_meta:
                    self._feature_names = loaded_meta["feature_names"]
                bounds = loaded_meta.get("iforest_bounds")
                if bounds:
                    self._iforest_p05 = float(bounds.get("p05", -0.15))
                    self._iforest_p995 = float(bounds.get("p995", 0.15))

                logger.info(
                    "Models loaded | version=%s | lgbm=OK | iforest=%s",
                    self.model_version, "OK" if self._iforest is not None else "NONE",
                )
                return True
            except Exception as exc:
                logger.error("Failed to load models | error=%s", exc, exc_info=True)
                self._model = None
                self._iforest = None
                return False

    def hot_swap(self, lgbm: Any, iforest: Any, metadata: dict[str, Any]) -> None:
        """재학습 완료된 Challenger 모델을 무중단으로 메모리에 교체한다."""
        with self._lock:
            self._model = lgbm
            self._iforest = iforest
            self._metadata = metadata
            if "category_vocab" in metadata:
                self._vocab = metadata["category_vocab"]
            if "feature_names" in metadata:
                self._feature_names = metadata["feature_names"]
            bounds = metadata.get("iforest_bounds")
            if bounds:
                self._iforest_p05 = float(bounds.get("p05", -0.15))
                self._iforest_p995 = float(bounds.get("p995", 0.15))
            logger.info("Hot-swapped Champion model in memory | new_version=%s", self.model_version)

    def predict(self, feature_df: pd.DataFrame) -> ModelPrediction:
        with self._lock:
            model = self._model
            iforest = self._iforest
            feature_names = list(self._feature_names)
            p05 = self._iforest_p05
            p995 = self._iforest_p995

        if model is None and iforest is None:
            return ModelPrediction(ml_score=None, anomaly_score=None, ml_reason=None)

        X = feature_df[feature_names]

        ml_score: float | None = None
        ml_reason: str | None = None
        shap_list: list[ShapContribution] = []

        if model is not None:
            try:
                prob = float(model.predict_proba(X)[0][1])
                ml_score = round(max(0.0, min(100.0, prob * 100.0)), 2)
                ml_reason, shap_list = self._extract_shap(model, X, feature_names)
            except Exception as exc:
                logger.error("LightGBM inference failed | error=%s", exc, exc_info=True)

        anomaly_score: float | None = None
        if iforest is not None:
            try:
                raw_anom = float(-iforest.decision_function(X)[0])
                # p05 ~ p995 구간을 0~100으로 정규화 (p995 이상은 85~100 영역으로 완만히 수렴)
                span = max(1e-6, p995 - p05)
                scaled = (raw_anom - p05) / span * 85.0
                anomaly_score = round(max(0.0, min(100.0, scaled)), 2)
            except Exception as exc:
                logger.error("IsolationForest inference failed | error=%s", exc, exc_info=True)

        return ModelPrediction(
            ml_score=ml_score,
            anomaly_score=anomaly_score,
            ml_reason=ml_reason,
            shap_contributions=shap_list,
        )

    def _extract_shap(
        self,
        model: Any,
        X: pd.DataFrame,
        feature_names: list[str],
    ) -> tuple[str, list[ShapContribution]]:
        """TreeSHAP(pred_contrib=True)로 상위 6개 피처 기여도 및 상위 2개 요약 텍스트를 반환한다."""
        try:
            booster = model.booster_
            contribs = np.asarray(booster.predict(X, pred_contrib=True))[0][:-1]
            row_vals = X.iloc[0]

            # 절댓값 기준 상위 6개 피처 (XAI 발산 막대 차트용)
            abs_ranked = np.argsort(np.abs(contribs))[::-1][:6]
            shap_items = [
                ShapContribution(
                    feature=feature_names[idx],
                    label=FEATURE_KOREAN_LABELS.get(feature_names[idx], feature_names[idx]),
                    value=round(float(row_vals[feature_names[idx]]), 4),
                    shap=round(float(contribs[idx]), 4),
                )
                for idx in abs_ranked
            ]

            # 양(+) 기여도 상위 2개 요약 문구
            pos_ranked = np.argsort(contribs)[::-1]
            labels: list[str] = []
            for idx in pos_ranked:
                if contribs[idx] <= 0:
                    break
                label = FEATURE_KOREAN_LABELS.get(feature_names[idx], feature_names[idx])
                if label not in labels:
                    labels.append(label)
                if len(labels) == 2:
                    break

            summary = f"주요 요인: {', '.join(labels)}" if labels else "패턴 이상 감지"
            return summary, shap_items
        except Exception:
            return "모델 추론 이상 감지", []
