"""
rule_engine.py — Layer 1: 명시적 정책 룰 엔진 (KRW 원화 기준)

FDS-DESIGN.md Section 5.5 기준:
- R1_BURST_1M       : tx_count_1m >= 5                          → 95.0
- R2_BURST_10M      : tx_count_10m >= 12                        → 88.0
- R3_HIGH_AMOUNT    : amount >= 1,500,000원                     → 90.0
- R4_NIGHT_HIGH_RISK: 새벽(0~5시) + 고위험 업종 + 300,000원 이상 → 85.0
"""
from dataclasses import dataclass

BURST_1M_THRESHOLD = 5
BURST_10M_THRESHOLD = 12
HIGH_AMOUNT_THRESHOLD_KRW = 1_500_000.0
NIGHT_HIGH_RISK_AMOUNT_KRW = 300_000.0
HIGH_RISK_NIGHT_CATEGORIES = frozenset({
    "shopping_net",
    "misc_net",
    "gambling",
    "crypto",
    "adult",
    "atm_withdrawal",
})


@dataclass(frozen=True)
class RuleEvaluation:
    score: float | None
    reasons: list[str]


def evaluate_rules(
    *,
    amount: float,
    merchant_category: str,
    is_night: bool,
    tx_count_1m: int,
    tx_count_10m: int,
) -> RuleEvaluation:
    """명시적 4대 정책 룰을 평가하고 최고 점수와 적중 사유 목록을 반환한다."""
    normalized_cat = (merchant_category or "").lower().strip()
    scores: list[float] = []
    reasons: list[str] = []

    if tx_count_1m >= BURST_1M_THRESHOLD:
        scores.append(95.0)
        reasons.append(f"단시간 다중 결제 (1분 내 {tx_count_1m}회)")

    if tx_count_10m >= BURST_10M_THRESHOLD:
        scores.append(88.0)
        reasons.append(f"단기 과다 결제 빈도 (10분 내 {tx_count_10m}회)")

    if amount >= HIGH_AMOUNT_THRESHOLD_KRW:
        scores.append(90.0)
        reasons.append(f"초고액 결제 ({amount:,.0f}원)")

    if is_night and normalized_cat in HIGH_RISK_NIGHT_CATEGORIES and amount >= NIGHT_HIGH_RISK_AMOUNT_KRW:
        scores.append(85.0)
        reasons.append(f"새벽 고위험 업종 결제 ({normalized_cat}, {amount:,.0f}원)")

    if not scores:
        return RuleEvaluation(score=None, reasons=[])

    return RuleEvaluation(score=max(scores), reasons=reasons)
