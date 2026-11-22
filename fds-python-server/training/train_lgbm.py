"""
train_lgbm.py — LightGBM 이상 거래 탐지 모델 학습 · 시계열 검증 · 아티팩트 저장 스크립트

사용법:
    # 1. 합성 데이터로 즉시 학습 (기본값)
    python -m training.train_lgbm --synthetic --samples 60000

    # 2. 실제 Kaggle Sparkov CSV (fraudTrain.csv)로 학습 (USD → KRW ×1350 자동 환산)
    python -m training.train_lgbm --csv data/fraudTrain.csv
"""
import argparse
import json
import logging
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
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

    df = pd.DataFrame({
        "transactionId": raw["trans_num"].astype(str),
        "userId": raw["cc_num"].astype(str).map(lambda s: f"user-{s[-6:]}"),
        "amount": (raw["amt"].astype(float) * USD_TO_KRW).round(0),
        "merchantCategory": raw["category"].astype(str).str.lower().str.strip(),
        "transactionDate": pd.to_datetime(raw["trans_date_trans_time"]).dt.tz_localize(KST).astype(str),
        "latitude": raw["merch_lat"].astype(float),
        "longitude": raw["merch_long"].astype(float),
        "is_fraud": raw["is_fraud"].astype(int),
    })
    return df


def recall_at_fpr(y_true: np.ndarray, y_prob: np.ndarray, max_fpr: float = 0.01) -> float:
    fpr, tpr, _ = roc_curve(y_true, y_prob)
    valid = tpr[fpr <= max_fpr]
    return float(valid.max()) if len(valid) > 0 else 0.0


def train_and_save(
    df: pd.DataFrame,
    dataset_source: str,
    model_out: Path,
    meta_out: Path,
) -> dict:
    # 시계열 정렬 (데이터 누수 방지)
    df = df.copy()
    df["_ts"] = pd.to_datetime(df["transactionDate"], utc=True)
    df = df.sort_values("_ts").drop(columns=["_ts"]).reset_index(drop=True)

    logger.info("Building 12 offline features (velocity 1m/10m/1h included, no travel distance)...")
    X = build_offline_feature_frame(df, vocab=CATEGORY_VOCAB)
    y = df["is_fraud"].astype(int).to_numpy()

    # 앞 80% 학습 / 뒤 20% 검증 (시계열 분할)
    split_idx = int(len(df) * 0.8)
    X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]

    pos_count = int(y_train.sum())
    neg_count = int(len(y_train) - pos_count)
    scale_pos_weight = max(1.0, neg_count / max(1, pos_count))

    logger.info(
        "Train size=%d (fraud=%d, %.2f%%) | Test size=%d (fraud=%d, %.2f%%) | scale_pos_weight=%.2f",
        len(y_train), pos_count, pos_count / len(y_train) * 100,
        len(y_test), int(y_test.sum()), y_test.sum() / len(y_test) * 100,
        scale_pos_weight,
    )

    model = LGBMClassifier(
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
    model.fit(
        X_train,
        y_train,
        categorical_feature=["merchant_category_id"],
    )

    y_prob = model.predict_proba(X_test)[:, 1]
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
        "confusion_matrix_at_0_80": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
    }

    model_out.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, model_out)

    metadata = {
        "model_version": "lgbm-fraud-v1.0",
        "trained_at": datetime.now(KST).isoformat(timespec="seconds"),
        "dataset_source": dataset_source,
        "currency": "KRW",
        "train_samples": int(len(y_train)),
        "test_samples": int(len(y_test)),
        "feature_names": FEATURE_COLUMNS,
        "category_vocab": CATEGORY_VOCAB,
        "metrics": metrics,
    }
    meta_out.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")

    logger.info("Model saved to %s", model_out)
    logger.info("Evaluation metrics: %s", json.dumps(metrics, ensure_ascii=False))
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser(description="Train LightGBM FDS fraud detection model")
    parser.add_argument("--csv", type=Path, default=None, help="Path to Kaggle Sparkov fraudTrain.csv")
    parser.add_argument("--synthetic", action="store_true", help="Use built-in Sparkov-compatible synthetic dataset")
    parser.add_argument("--samples", type=int, default=60_000, help="Number of synthetic rows")
    parser.add_argument("--limit", type=int, default=None, help="Optional row limit for CSV loading")
    parser.add_argument(
        "--model-out",
        type=Path,
        default=BASE_DIR / "models" / "lgbm_fraud_v1.joblib",
    )
    parser.add_argument(
        "--meta-out",
        type=Path,
        default=BASE_DIR / "models" / "metadata.json",
    )
    args = parser.parse_args()

    if args.csv is not None:
        df = load_sparkov_csv(args.csv, limit=args.limit)
        source = f"kaggle-sparkov:{args.csv.name}"
    else:
        df = generate_synthetic_dataset(n_samples=args.samples)
        source = f"synthetic-sparkov-krw:{args.samples}"

    train_and_save(df, source, args.model_out, args.meta_out)


if __name__ == "__main__":
    main()
