"""
drift_monitor.py — PSI (Population Stability Index) 기반 실시간 데이터 드리프트 모니터링

FDS-DESIGN.md Section 10.2.E 기준:
- 학습 시점의 amount / tx_count_1m 기준 히스토그램과 운영 중 최근 500건 슬라이딩 윈도우 분포를 비교
- PSI < 0.10: NORMAL / 0.10 <= PSI < 0.25: WARNING / PSI >= 0.25: DRIFT (재학습 권장)
"""
from collections import deque
import threading
from typing import Any

import numpy as np

EPS = 1e-6


def _compute_psi(expected_ratios: list[float], actual_values: list[float], bin_edges: list[float]) -> float:
    if not expected_ratios or not actual_values or len(bin_edges) < 2:
        return 0.0

    counts, _ = np.histogram(np.asarray(actual_values, dtype=float), bins=np.asarray(bin_edges, dtype=float))
    total = counts.sum()
    if total == 0:
        return 0.0

    actual_ratios = counts / total
    exp = np.clip(np.asarray(expected_ratios, dtype=float), EPS, 1.0)
    act = np.clip(actual_ratios, EPS, 1.0)
    psi = float(np.sum((act - exp) * np.log(act / exp)))
    return round(max(0.0, psi), 4)


class DataDriftMonitor:
    def __init__(self, window_size: int = 500, min_samples: int = 10):
        self._window_size = window_size
        self._min_samples = min_samples
        self._lock = threading.Lock()
        self._amounts: deque[float] = deque(maxlen=window_size)
        self._velocities: deque[float] = deque(maxlen=window_size)
        self._baseline: dict[str, Any] = {}

    def set_baseline(self, baseline: dict[str, Any] | None) -> None:
        with self._lock:
            self._baseline = baseline or {}

    def record(self, amount: float, tx_count_1m: int) -> None:
        with self._lock:
            self._amounts.append(float(amount))
            self._velocities.append(float(tx_count_1m))

    def get_status(self) -> dict[str, Any]:
        with self._lock:
            amounts = list(self._amounts)
            velocities = list(self._velocities)
            baseline = dict(self._baseline)

        sample_count = len(amounts)
        if sample_count < self._min_samples or not baseline:
            return {
                "psiScore": 0.0,
                "amountPsi": 0.0,
                "velocityPsi": 0.0,
                "status": "NORMAL",
                "sampleCount": sample_count,
                "minSamplesRequired": self._min_samples,
                "message": (
                    f"안정적 (표본 {sample_count}/{self._min_samples}건 수집 중)"
                    if sample_count < self._min_samples
                    else "기준 분포 정보 없음"
                ),
            }

        amount_psi = _compute_psi(
            baseline.get("amount_ratios", []),
            amounts,
            baseline.get("amount_edges", []),
        )
        velocity_psi = _compute_psi(
            baseline.get("velocity_ratios", []),
            velocities,
            baseline.get("velocity_edges", []),
        )
        psi_score = round(max(amount_psi, velocity_psi), 4)

        if psi_score >= 0.25:
            status = "DRIFT"
            message = "실시간 거래 분포가 학습 기준 대비 크게 변화했습니다. 피드백 반영 재학습을 권장합니다."
        elif psi_score >= 0.10:
            status = "WARNING"
            message = "실시간 거래 분포에 완만한 변화가 감지되었습니다. 추이를 주시하세요."
        else:
            status = "NORMAL"
            message = "실시간 거래 분포가 학습 기준 대비 안정적으로 유지되고 있습니다."

        return {
            "psiScore": psi_score,
            "amountPsi": amount_psi,
            "velocityPsi": velocity_psi,
            "status": status,
            "sampleCount": sample_count,
            "minSamplesRequired": self._min_samples,
            "message": message,
        }
