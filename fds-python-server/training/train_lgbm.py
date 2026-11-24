"""
train_lgbm.py — LightGBM(지도) + Isolation Forest(비지도) 앙상블 학습 · 검증 · PSI 기준 분포 저장

사용법:
    # 1. 합성 데이터로 즉시 학습 (기본값)
    python -m training.train_lgbm --synthetic --samples 60000

    # 2. 실제 Kaggle Sparkov CSV (fraudTrain.csv)로 학습 (USD → KRW ×1350 자동 환산)
    python -m training.train_lgbm --csv data/fraudTrain.csv
"""
import argparse
from datetime import datetime
import json
import logging
from pathlib import Path
from typing import Any

import joblib
from lightgbm import LGBMClassifier
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    f1_score,
    roc_auc_score,
    roc_curve,
)

from app.config import BASE_DIR
from app.features import CATEGORY_VOCAB, FEATURE_COLUMNS, KST, build_offline_feature_frame
from training.generate_synthetic_data import generate_synthetic_dataset

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

USD_TO_KRW = 1350.0


def load_sparkov_csv(csv_path: Path, limit: int | None = None) -> pd.DataFrame:
    """Kaggle Sparkov fraudTrain.csv를 FDS 표준 KRW 스키마로 매핑한다."""
    logger.info("Loading Kaggle Sparkov CSV: %s", csv_path)
    raw = pd.read_csv(csv_path, nrows=limit)

    return pd.DataFrame({
        "transactionId": raw["trans_num"].astype(str),
        "userId": raw["cc_num"].astype(str).map(lambda s: f"user-{s[-6:]}"),
        "amount": (raw["amt"].astype(float) * USD_TO_KRW).round(0),
        "merchantCategory": raw["category"].astype(str).str.lower().str.strip(),
        "transactionDate": pd.to_datetime(raw["trans_date_trans_time"]).dt.tz_localize(KST).astype(str),
        "latitude": raw["merch_lat"].astype(float),
        "longitude": raw["merch_long"].astype(float),
        "is_fraud": raw["is_fraud"].astype(int),
    })


def recall_at_fpr(y_true: np.ndarray, y_prob: np.ndarray, max_fpr: float = 0.01) -> float:
    fpr, tpr, _ = roc_curve(y_true, y_prob)
    valid = tpr[fpr <= max_fpr]
    return float(valid.max()) if len(valid) > 0 else 0.0


def _build_drift_baseline(X_train: pd.DataFrame) -> dict[str, Any]:
    """PSI 드리프트 모니터링용 기준 구간(amount 10-bin, tx_count_1m 고정 구간)을 산출한다."""
    amounts = X_train["amount"].to_numpy(dtype=float)
    quantiles = np.unique(np.quantile(amounts, np.linspace(0.0, 1.0, 11)))
    if len(quantiles) < 3:
        quantiles = np.array([0.0, 50_000.0, 200_000.0, 1_000_000.0, 1e9])
    else:
        quantiles[0] = 0.0
        quantiles[-1] = max(float(quantiles[-1]) * 10.0, 1e9)

    amt_counts, _ = np.histogram(amounts, bins=quantiles)
    amt_ratios = (amt_counts / max(1, amt_counts.sum())).tolist()

    vel_edges = [0.0, 1.5, 2.5, 4.5, 10.5, 1e6]
    vel_counts, _ = np.histogram(X_train["tx_count_1m"].to_numpy(dtype=float), bins=vel_edges)
    vel_ratios = (vel_counts / max(1, vel_counts.sum())).tolist()

    return {
        "amount_edges": [float(v) for v in quantiles],
        "amount_ratios": [round(float(r), 6) for r in amt_ratios],
        "velocity_edges": vel_edges,
        "velocity_ratios": [round(float(r), 6) for r in vel_ratios],
    }


def train_models_in_memory(
    df: pd.DataFrame,
    dataset_source: str,
    model_version: str = "lgbm-iforest-v1.0",
    feedback_df: pd.DataFrame | None = None,
    feedback_weight: float = 10.0,
) -> tuple[LGBMClassifier, IsolationForest, dict[str, Any]]:
    """LightGBM(지도) + IsolationForest(비지도)를 학습하고 평가 지표 및 메타데이터를 반환한다."""
    work = df.copy()
    work["_ts"] = pd.to_datetime(work["transactionDate"], utc=True)
    work = work.sort_values("_ts").drop(columns=["_ts"]).reset_index(drop=True)

    X = build_offline_feature_frame(work, vocab=CATEGORY_VOCAB)
    y = work["is_fraud"].astype(int).to_numpy()

    # 앞 80% 학습 / 뒤 20% 검증 (시계열 분할)
    split_idx = int(len(work) * 0.8)
    X_train, X_test = X.iloc[:split_idx].copy(), X.iloc[split_idx:].copy()
    y_train, y_test = y[:split_idx].copy(), y[split_idx:].copy()
    sample_weights = np.ones(len(X_train), dtype=float)

    # Human-in-the-Loop 관리자 피드백 데이터가 있으면 가중치를 부여해 학습 세트에 편입
    feedback_count = 0
    if feedback_df is not None and len(feedback_df) > 0:
        fb_X = build_offline_feature_frame(feedback_df, vocab=CATEGORY_VOCAB)
        fb_y = feedback_df["is_fraud"].astype(int).to_numpy()
        X_train = pd.concat([X_train, fb_X], ignore_index=True)
        y_train = np.concatenate([y_train, fb_y])
        sample_weights = np.concatenate([sample_weights, np.full(len(fb_X), feedback_weight)])
        feedback_count = len(fb_X)

    pos_count = int(y_train.sum())
    neg_count = int(len(y_train) - pos_count)
    scale_pos_weight = max(1.0, neg_count / max(1, pos_count))

    logger.info(
        "Training LightGBM + IsolationForest | train=%d (feedback=%d) | test=%d | spw=%.2f",
        len(y_train), feedback_count, len(y_test), scale_pos_weight,
    )

    # 1. Layer 2: LightGBM (지도학습)
    lgbm = LGBMClassifier(
        n_estimators=250,
        learning_rate=0.05,
        num_leaves=31,
        subsample_for_bin=50000,
        colsample_bytree=0.85,
        subsample=0.85,
        scale_pos_weight=scale_pos_weight,
        random_state=42,
        n_jobs=-1,
        verbose=-1,
    )
    lgbm.fit(
        X_train,
        y_train,
        sample_weight=sample_weights,
        categorical_feature=["merchant_category_id"],
    )

    # 2. Layer 3: Isolation Forest (비지도학습 — 정상 거래 분포만 학습해 신종 이상 포착)
    X_normal_train = X_train[y_train == 0]
    if len(X_normal_train) > 25_000:
        X_normal_fit = X_normal_train.sample(n=25_000, random_state=42)
    else:
        X_normal_fit = X_normal_train

    iforest = IsolationForest(
        n_estimators=150,
        contamination=0.02,
        max_samples="auto",
        random_state=42,
        n_jobs=-1,
    )
    iforest.fit(X_normal_fit)

    # 비지도 raw anomaly score(-decision_function) 캘리브레이션 경계 산출
    raw_normal_scores = -iforest.decision_function(X_normal_fit)
    raw_test_scores = -iforest.decision_function(X_test)
    p05 = float(np.quantile(raw_normal_scores, 0.05))
    p995 = float(np.quantile(raw_normal_scores, 0.995))
    if p995 <= p05:
        p995 = p05 + 0.1

    iforest_roc = float(roc_auc_score(y_test, raw_test_scores))

    # LightGBM 검증 지표
    y_prob = lgbm.predict_proba(X_test)[:, 1]
    y_pred_80 = (y_prob >= 0.80).astype(int)
    y_pred_50 = (y_prob >= 0.50).astype(int)

    pr_auc = float(average_precision_score(y_test, y_prob))
    roc_auc = float(roc_auc_score(y_test, y_prob))
    f1_80 = float(f1_score(y_test, y_pred_80, zero_division=0))
    f1_50 = float(f1_score(y_test, y_pred_50, zero_division=0))
    rec_1pct = recall_at_fpr(y_test, y_prob, max_fpr=0.01)
    tn, fp, fn, tp = confusion_matrix(y_test, y_pred_80).ravel()

    metrics = {
        "pr_auc": round(pr_auc, 4),
        "roc_auc": round(roc_auc, 4),
        "f1_at_0_80": round(f1_80, 4),
        "f1_at_0_50": round(f1_50, 4),
        "recall_at_fpr_1pct": round(rec_1pct, 4),
        "iforest_roc_auc": round(iforest_roc, 4),
        "confusion_matrix_at_0_80": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
    }

    metadata = {
        "model_version": model_version,
        "trained_at": datetime.now(KST).isoformat(timespec="seconds"),
        "dataset_source": dataset_source,
        "currency": "KRW",
        "train_samples": int(len(y_train)),
        "test_samples": int(len(y_test)),
        "feedback_samples": feedback_count,
        "feature_names": FEATURE_COLUMNS,
        "category_vocab": CATEGORY_VOCAB,
        "iforest_bounds": {"p05": round(p05, 6), "p995": round(p995, 6)},
        "drift_baseline": _build_drift_baseline(X_train),
        "metrics": metrics,
    }
    return lgbm, iforest, metadata


def save_artifacts(
    lgbm: LGBMClassifier,
    iforest: IsolationForest,
    metadata: dict[str, Any],
    model_out: Path,
    iforest_out: Path,
    meta_out: Path,
    history_out: Path | None = None,
    promoted: bool = True,
    note: str = "초기 모델 학습",
) -> None:
    model_out.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(lgbm, model_out)
    joblib.dump(iforest, iforest_out)
    meta_out.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")

    if history_out is not None:
        history: list[dict] = []
        if history_out.exists():
            try:
                history = json.loads(history_out.read_text(encoding="utf-8"))
            except Exception:
                history = []
        history.insert(0, {
            "version": metadata["model_version"],
            "trainedAt": metadata["trained_at"],
            "datasetSource": metadata["dataset_source"],
            "feedbackSamples": metadata.get("feedback_samples", 0),
            "promoted": promoted,
            "note": note,
            "metrics": metadata["metrics"],
        })
        history_out.write_text(json.dumps(history[:20], ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Train LightGBM + IsolationForest FDS models")
    parser.add_argument("--csv", type=Path, default=None, help="Path to Kaggle Sparkov fraudTrain.csv")
    parser.add_argument("--synthetic", action="store_true", help="Use built-in synthetic dataset")
    parser.add_argument("--samples", type=int, default=60_000, help="Number of synthetic rows")
    parser.add_argument("--limit", type=int, default=None, help="Optional row limit for CSV")
    parser.add_argument("--model-out", type=Path, default=BASE_DIR / "models" / "lgbm_fraud_v1.joblib")
    parser.add_argument("--iforest-out", type=Path, default=BASE_DIR / "models" / "iforest_v1.joblib")
    parser.add_argument("--meta-out", type=Path, default=BASE_DIR / "models" / "metadata.json")
    parser.add_argument("--history-out", type=Path, default=BASE_DIR / "models" / "history.json")
    args = parser.parse_args()

    if args.csv is not None:
        df = load_sparkov_csv(args.csv, limit=args.limit)
        source = f"kaggle-sparkov:{args.csv.name}"
    else:
        df = generate_synthetic_dataset(n_samples=args.samples)
        source = f"synthetic-sparkov-krw:{args.samples}"

    lgbm, iforest, metadata = train_models_in_memory(df, source)
    save_artifacts(lgbm, iforest, metadata, args.model_out, args.iforest_out, args.meta_out, args.history_out)
    logger.info("Artifacts saved | version=%s | metrics=%s", metadata["model_version"], json.dumps(metadata["metrics"]))


if __name__ == "__main__":
    main()
