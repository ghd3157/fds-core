"""
feature_store.py — Redis ZSET 기반 실시간 사용자 결제빈도 피처 스토어

FDS-DESIGN.md Section 5.3 기준:
- Key: fds:vel:user:{userId} (TTL: 4200초)
- 이동거리 피처는 제외하고 1분 / 10분 / 1시간 결제 횟수만 원자적 Pipeline으로 산출
- Redis 일시 장애 시 Fallback (1, 1, 1) 반환으로 탐지 파이프라인 무중단 보장
"""
import logging
from dataclasses import dataclass

import redis

from app.config import settings

logger = logging.getLogger(__name__)

VELOCITY_KEY_PREFIX = "fds:vel:user:"
VELOCITY_TTL_SECONDS = 4200  # 1시간(3600s) + 여유 10분


@dataclass(frozen=True)
class VelocityFeatures:
    tx_count_1m: int
    tx_count_10m: int
    tx_count_1h: int


class RedisFeatureStore:
    def __init__(self, client: redis.Redis | None = None):
        self._client = client or redis.Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            db=settings.redis_db,
            socket_connect_timeout=settings.redis_socket_timeout,
            socket_timeout=settings.redis_socket_timeout,
            decode_responses=True,
        )

    def record_and_get_velocity(
        self,
        user_id: str,
        transaction_id: str,
        tx_epoch_seconds: float,
    ) -> VelocityFeatures:
        """현재 거래를 사용자 ZSET에 기록하고 최근 1분/10분/1시간 결제 횟수를 반환한다."""
        key = f"{VELOCITY_KEY_PREFIX}{user_id}"
        try:
            pipe = self._client.pipeline(transaction=True)
            pipe.zremrangebyscore(key, "-inf", tx_epoch_seconds - 3600)
            pipe.zadd(key, {transaction_id: tx_epoch_seconds})
            pipe.zcount(key, tx_epoch_seconds - 60, tx_epoch_seconds)
            pipe.zcount(key, tx_epoch_seconds - 600, tx_epoch_seconds)
            pipe.zcount(key, tx_epoch_seconds - 3600, tx_epoch_seconds)
            pipe.expire(key, VELOCITY_TTL_SECONDS)
            results = pipe.execute()

            count_1m = max(1, int(results[2]))
            count_10m = max(1, int(results[3]))
            count_1h = max(1, int(results[4]))
            return VelocityFeatures(count_1m, count_10m, count_1h)
        except Exception as exc:
            logger.warning(
                "Redis velocity lookup failed (fallback to 1/1/1) | userId=%s | error=%s",
                user_id, exc,
            )
            return VelocityFeatures(1, 1, 1)

    def ping(self) -> bool:
        try:
            return bool(self._client.ping())
        except Exception:
            return False

    def close(self) -> None:
        try:
            self._client.close()
        except Exception:
            pass
