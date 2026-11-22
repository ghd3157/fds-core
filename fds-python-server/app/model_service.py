"""
model_service.py — Layer 2: LightGBM 모델 로더 · 실시간 추론 · TreeSHAP 사유 생성

FDS-DESIGN.md Section 5.4 ~ 5.5 기준:
- models/lgbm_fraud_v1.joblib + models/metadata.json 로드
- predict_proba → 0.0 ~ 100.0 위험 스코어 변환
- LightGBM 내장 pred_contrib=True (TreeSHAP)로 상위 기여 피처 2개 추출 → 한글 사유 생성
- 모델 미존재/오류 시 None 반환 (Rule Engine Fallback 보장)
"""
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from app.config import settings
from app.features import CATEGORY_VOCAB, FEATURE_COLUMNS, FEATURE_KOREAN_LABELS

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ModelPrediction:
    score: float | None
    reason: str | None


class LightGBMModelService:
    def __init__(
        self,
        model_path: Path | None = None,
        metadata_path: Path | None = None,
    ):
        self._model_path = model_path or settings.model_path
        self._metadata_path = metadata_path or settings.metadata_path
        self._model: Any = None
        self._metadata: dict[str, Any] = {}
        self._vocab: dict[str, int] = dict(CATEGORY_VOCAB)
        self._feature_names: list[str] = list(FEATURE_COLUMNS)

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    @property
    def model_version(self) -> str:
        return str(self._metadata.get("model_version", "unloaded"))

    @property
    def category_vocab(self) -> dict[str, int]:
        return self._vocab

    def load(self) -> bool:
        if not self._model_path.exists():
            logger.warning(
                "LightGBM model artifact not found at %s (running in Rule-Engine fallback mode)",
                self._model_path,
            )
            self._model = None
            return False

        try:
            self._model = joblib.load(self._model_path)
            if self._metadata_path.exists():
                self._metadata = json.loads(self._metadata_path.read_text(encoding="utf-8"))
                if "category_vocab" in self._metadata:
                    self._vocab = self._metadata["category_vocab"]
                if "feature_names" in self._metadata:
                    self._feature_names = self._metadata["feature_names"]
            logger.info(
                "LightGBM model loaded successfully | version=%s | path=%s",
                self.model_version, self._model_path,
            )
            return True
        except Exception as exc:
            logger.error("Failed to load LightGBM model | error=%s", exc, exc_info=True)
            self._model = None
            return False

    def predict(self, feature_df: pd.DataFrame) -> ModelPrediction:
        if self._model is None:
            return ModelPrediction(score=None, reason=None)

        try:
            X = feature_df[self._feature_names]
            prob = float(self._model.predict_proba(X)[0][1])
            score = round(max(0.0, min(100.0, prob * 100.0)), 2)
            reason = self._extract_top_reasons(X)
            return ModelPrediction(score=score, reason=reason)
        except Exception as exc:
            logger.error("LightGBM inference failed (fallback to rule engine) | error=%s", exc, exc_info=True)
            return ModelPrediction(score=None, reason=None)

    def _extract_top_reasons(self, X: pd.DataFrame) -> str:
        """LightGBM 내장 TreeSHAP(pred_contrib=True)으로 상위 양(+) 기여 피처 2개를 추출한다."""
        try:
            booster = self._model.booster_
            contribs = np.asarray(booster.predict(X, pred_contrib=True))[0][:-1]  # 마지막 원소는 base bias
            ranked_indices = np.argsort(contribs)[::-1]

            labels: list[str] = []
            for idx in ranked_indices:
                if contribs[idx] <= 0:
                    break
                fname = self._feature_names[idx]
                label = FEATURE_KOREAN_LABELS.get(fname, fname)
                if label not in labels:
                    labels.append(label)
                if len(labels) == 2:
                    break

            if labels:
                return f"주요 요인: {', '.join(labels)}"
            return "패턴 이상 감지"
        except Exception:
            return "모델 추론 이상 감지"
