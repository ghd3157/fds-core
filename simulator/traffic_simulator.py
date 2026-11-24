"""
traffic_simulator.py — FDS 실시간 결제 트래픽 시뮬레이터 (표준 라이브러리 전용)

FDS-DESIGN.md Section 8.1 기준:
- mixed    : 정상 85% + 사기 패턴 15% (고액/새벽고위험/연타) 실시간 스트림
- burst    : 동일 사용자 1분 내 N건 연속 발송 → Redis 결제빈도(R1_BURST_1M) + HYBRID 트리거
- scenario : 단건 시나리오 (normal / high-amount / night-risk)
- csv      : Kaggle Sparkov fraudTest.csv 재생 (USD → KRW ×1350 환산)

사용 예시:
    python simulator/traffic_simulator.py --mode mixed --tps 2 --duration 30
    python simulator/traffic_simulator.py --mode burst --user-id user-demo-burst --count 6 --interval 0.5
    python simulator/traffic_simulator.py --mode scenario --type high-amount
    python simulator/traffic_simulator.py --mode scenario --type night-risk
    python simulator/traffic_simulator.py --mode csv --file data/fraudTest.csv --tps 3 --limit 100
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

KST = timezone(timedelta(hours=9))
USD_TO_KRW = 1350.0

NORMAL_CATEGORIES = [
    "grocery_pos",
    "food_dining",
    "gas_transport",
    "shopping_pos",
    "entertainment",
    "health_fitness",
    "home",
    "kids_pets",
    "personal_care",
]

NIGHT_HIGH_RISK_CATEGORIES = [
    "shopping_net",
    "misc_net",
    "gambling",
    "crypto",
]


@dataclass
class SendStats:
    total: int = 0
    accepted: int = 0
    failed: int = 0


def now_kst_iso() -> str:
    return datetime.now(KST).isoformat(timespec="seconds")


def night_kst_iso() -> str:
    now = datetime.now(KST)
    night_dt = now.replace(hour=random.randint(1, 4), minute=random.randint(0, 59), second=random.randint(0, 59))
    return night_dt.isoformat(timespec="seconds")


def build_normal_payload(user_id: str | None = None) -> dict[str, Any]:
    return {
        "transactionId": f"sim-norm-{uuid.uuid4().hex[:12]}",
        "userId": user_id or f"user-{random.randint(1000, 1199)}",
        "amount": float(random.randrange(5_000, 180_000, 1_000)),
        "merchantCategory": random.choice(NORMAL_CATEGORIES),
        "latitude": round(37.5665 + random.uniform(-0.15, 0.15), 4),
        "longitude": round(126.9780 + random.uniform(-0.15, 0.15), 4),
        "transactionDate": now_kst_iso(),
    }


def build_high_amount_payload(user_id: str | None = None) -> dict[str, Any]:
    return {
        "transactionId": f"sim-high-{uuid.uuid4().hex[:12]}",
        "userId": user_id or f"user-{random.randint(2000, 2099)}",
        "amount": float(random.randrange(1_600_000, 3_500_000, 10_000)),
        "merchantCategory": random.choice(["shopping_net", "travel", "misc_net"]),
        "latitude": round(37.5665 + random.uniform(-0.2, 0.2), 4),
        "longitude": round(126.9780 + random.uniform(-0.2, 0.2), 4),
        "transactionDate": now_kst_iso(),
    }


def build_night_risk_payload(user_id: str | None = None) -> dict[str, Any]:
    return {
        "transactionId": f"sim-night-{uuid.uuid4().hex[:12]}",
        "userId": user_id or f"user-{random.randint(3000, 3099)}",
        "amount": float(random.randrange(350_000, 1_300_000, 10_000)),
        "merchantCategory": random.choice(NIGHT_HIGH_RISK_CATEGORIES),
        "latitude": round(37.5665 + random.uniform(-0.2, 0.2), 4),
        "longitude": round(126.9780 + random.uniform(-0.2, 0.2), 4),
        "transactionDate": night_kst_iso(),
    }


def build_burst_payload(user_id: str, seq: int) -> dict[str, Any]:
    return {
        "transactionId": f"sim-burst-{seq:02d}-{uuid.uuid4().hex[:10]}",
        "userId": user_id,
        "amount": float(random.randrange(250_000, 1_200_000, 10_000)),
        "merchantCategory": "shopping_net",
        "latitude": 37.5665,
        "longitude": 126.9780,
        "transactionDate": now_kst_iso(),
    }


def send_log(
    url: str,
    api_key: str,
    payload: dict[str, Any],
    label: str,
    stats: SendStats,
    dry_run: bool = False,
) -> None:
    stats.total += 1
    if dry_run:
        stats.accepted += 1
        print(
            f"[DRY-RUN][{label:<11}] tx={payload['transactionId']} "
            f"user={payload['userId']} amount={payload['amount']:,.0f}원 "
            f"cat={payload['merchantCategory']}"
        )
        return

    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url=url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-API-Key": api_key,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            status = resp.status
            if 200 <= status < 300:
                stats.accepted += 1
                print(
                    f"[{status} OK][{label:<11}] tx={payload['transactionId']} "
                    f"user={payload['userId']} amount={payload['amount']:,.0f}원 "
                    f"cat={payload['merchantCategory']}"
                )
            else:
                stats.failed += 1
                print(f"[HTTP {status}][{label}] tx={payload['transactionId']}")
    except urllib.error.HTTPError as exc:
        stats.failed += 1
        err_body = exc.read().decode("utf-8", errors="replace")
        print(f"[HTTP {exc.code} ERR][{label}] tx={payload['transactionId']} -> {err_body}")
    except Exception as exc:
        stats.failed += 1
        print(f"[CONN ERR][{label}] tx={payload['transactionId']} -> {exc}")


def run_mixed(
    url: str,
    api_key: str,
    tps: float,
    duration: float,
    fraud_rate: float,
    dry_run: bool,
) -> SendStats:
    stats = SendStats()
    interval = 1.0 / max(0.1, tps)
    deadline = time.monotonic() + duration
    burst_user = f"user-burst-{random.randint(100, 999)}"
    burst_remaining = 0

    print(
        f"=== MIXED 스트림 시작 | tps={tps} | duration={duration}s | "
        f"fraud_rate={fraud_rate * 100:.0f}% ==="
    )

    while time.monotonic() < deadline:
        t0 = time.monotonic()

        if burst_remaining > 0:
            seq = 7 - burst_remaining
            payload = build_burst_payload(burst_user, seq)
            send_log(url, api_key, payload, "BURST", stats, dry_run)
            burst_remaining -= 1
        elif random.random() < fraud_rate:
            kind = random.choice(["high", "night", "burst"])
            if kind == "high":
                send_log(url, api_key, build_high_amount_payload(), "HIGH-AMOUNT", stats, dry_run)
            elif kind == "night":
                send_log(url, api_key, build_night_risk_payload(), "NIGHT-RISK", stats, dry_run)
            else:
                burst_user = f"user-burst-{random.randint(100, 999)}"
                burst_remaining = 5
                send_log(url, api_key, build_burst_payload(burst_user, 1), "BURST", stats, dry_run)
        else:
            send_log(url, api_key, build_normal_payload(), "NORMAL", stats, dry_run)

        elapsed = time.monotonic() - t0
        sleep_time = max(0.0, interval - elapsed)
        if sleep_time > 0 and time.monotonic() < deadline:
            time.sleep(sleep_time)

    return stats


def run_burst(
    url: str,
    api_key: str,
    user_id: str,
    count: int,
    interval: float,
    dry_run: bool,
) -> SendStats:
    stats = SendStats()
    print(f"=== BURST 연타 시연 시작 | userId={user_id} | count={count} | interval={interval}s ===")
    for i in range(1, count + 1):
        payload = build_burst_payload(user_id, i)
        send_log(url, api_key, payload, f"BURST-{i}/{count}", stats, dry_run)
        if i < count and interval > 0:
            time.sleep(interval)
    return stats


def run_scenario(
    url: str,
    api_key: str,
    scenario_type: str,
    user_id: str | None,
    dry_run: bool,
) -> SendStats:
    stats = SendStats()
    if scenario_type == "normal":
        payload = build_normal_payload(user_id)
        label = "NORMAL"
    elif scenario_type == "high-amount":
        payload = build_high_amount_payload(user_id)
        label = "HIGH-AMOUNT"
    elif scenario_type == "night-risk":
        payload = build_night_risk_payload(user_id)
        label = "NIGHT-RISK"
    else:
        raise ValueError(f"Unsupported scenario type: {scenario_type}")

    send_log(url, api_key, payload, label, stats, dry_run)
    return stats


def run_csv(
    url: str,
    api_key: str,
    csv_path: Path,
    tps: float,
    limit: int,
    dry_run: bool,
) -> SendStats:
    stats = SendStats()
    interval = 1.0 / max(0.1, tps)
    print(f"=== CSV 재생 시작 | file={csv_path} | tps={tps} | limit={limit} ===")

    with csv_path.open("r", encoding="utf-8", newline="") as fp:
        reader = csv.DictReader(fp)
        for idx, row in enumerate(reader, start=1):
            if limit > 0 and idx > limit:
                break

            t0 = time.monotonic()
            cc_num = str(row.get("cc_num", "000000"))
            raw_amt = float(row.get("amt", 10.0))
            payload = {
                "transactionId": f"csv-{row.get('trans_num', uuid.uuid4().hex[:12])}-{idx}",
                "userId": f"user-{cc_num[-6:]}",
                "amount": round(raw_amt * USD_TO_KRW, 0),
                "merchantCategory": str(row.get("category", "misc_pos")).lower().strip(),
                "latitude": float(row.get("merch_lat", 37.5665)),
                "longitude": float(row.get("merch_long", 126.9780)),
                "transactionDate": now_kst_iso(),
            }
            label = "CSV-FRAUD" if str(row.get("is_fraud", "0")) == "1" else "CSV-NORM"
            send_log(url, api_key, payload, label, stats, dry_run)

            elapsed = time.monotonic() - t0
            if interval > elapsed:
                time.sleep(interval - elapsed)

    return stats


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="FDS 실시간 결제 트래픽 시뮬레이터")
    parser.add_argument(
        "--mode",
        choices=["mixed", "burst", "scenario", "csv"],
        default="mixed",
        help="실행 모드 선택 (기본: mixed)",
    )
    parser.add_argument(
        "--base-url",
        default=os.getenv("FDS_API_BASE_URL", "http://localhost:8080/api/v1"),
        help="Spring Boot API Base URL",
    )
    parser.add_argument(
        "--api-key",
        default=os.getenv("FDS_INGEST_API_KEY", "fds-demo-api-key-change-me"),
        help="수집 API X-API-Key 값",
    )
    parser.add_argument("--tps", type=float, default=2.0, help="초당 전송 건수 (mixed/csv)")
    parser.add_argument("--duration", type=float, default=30.0, help="mixed 모드 실행 시간(초)")
    parser.add_argument("--fraud-rate", type=float, default=0.15, help="mixed 모드 이상 거래 비율 (0~1)")
    parser.add_argument("--user-id", default="user-demo-burst", help="burst/scenario 대상 사용자 ID")
    parser.add_argument("--count", type=int, default=6, help="burst 모드 연속 발송 건수")
    parser.add_argument("--interval", type=float, default=0.5, help="burst 모드 발송 간격(초)")
    parser.add_argument(
        "--type",
        dest="scenario_type",
        choices=["normal", "high-amount", "night-risk"],
        default="high-amount",
        help="scenario 모드 유형",
    )
    parser.add_argument("--file", type=Path, default=None, help="csv 모드 Sparkov CSV 파일 경로")
    parser.add_argument("--limit", type=int, default=100, help="csv 모드 최대 전송 건수")
    parser.add_argument("--dry-run", action="store_true", help="실제 HTTP 전송 없이 페이로드만 출력")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    ingest_url = f"{args.base_url.rstrip('/')}/logs"

    if args.mode == "mixed":
        stats = run_mixed(ingest_url, args.api_key, args.tps, args.duration, args.fraud_rate, args.dry_run)
    elif args.mode == "burst":
        stats = run_burst(ingest_url, args.api_key, args.user_id, args.count, args.interval, args.dry_run)
    elif args.mode == "scenario":
        stats = run_scenario(ingest_url, args.api_key, args.scenario_type, args.user_id, args.dry_run)
    elif args.mode == "csv":
        if args.file is None or not args.file.exists():
            print("오류: --mode csv 실행 시 존재하는 --file 경로를 지정해야 합니다.", file=sys.stderr)
            return 1
        stats = run_csv(ingest_url, args.api_key, args.file, args.tps, args.limit, args.dry_run)
    else:
        return 1

    print(
        f"\n=== 시뮬레이션 종료 | 총 발송={stats.total} | "
        f"수락(202)={stats.accepted} | 실패={stats.failed} ==="
    )
    return 0 if stats.failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
