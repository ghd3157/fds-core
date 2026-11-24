"""
kafka_client.py — 수동 커밋 Kafka Consumer / Producer 및 DLQ 파이프라인

FDS-DESIGN.md Section 4.3 기준:
- 기존 _on_assign의 p.offset = -2 강제 리셋 완전 제거 (재시작 시 중복 처리 버그 원천 해소)
- enable.auto.commit=False + 결과 발행 flush 확정 후 consumer.commit() 수동 커밋
- 파싱/검증 실패 또는 처리 불가 메시지는 fds-dlq-topic으로 격리 후 커밋
"""
import asyncio
import json
import logging
from datetime import datetime
from typing import Any

from confluent_kafka import Consumer, KafkaError, KafkaException, Producer

from app.config import settings
from app.features import KST
from app.fraud_detector import HybridFraudDetector
from app.schemas import FraudResultOutput, PaymentLogInput

logger = logging.getLogger(__name__)


class KafkaPipelineWorker:
    def __init__(self, detector: HybridFraudDetector):
        self._detector = detector
        self._producer: Producer | None = None
        self._consumer: Consumer | None = None
        self._running = False

    @property
    def is_running(self) -> bool:
        return self._running

    def _ensure_producer(self) -> Producer:
        if self._producer is None:
            self._producer = Producer({
                "bootstrap.servers": settings.kafka_broker,
                "acks": "all",
                "retries": 3,
                "linger.ms": 5,
            })
        return self._producer

    def produce_fraud_result(self, result: FraudResultOutput) -> None:
        producer = self._ensure_producer()
        delivery_error: list[Any] = []

        def _delivery_report(err, msg):
            if err is not None:
                delivery_error.append(err)
                logger.error("Kafka produce failed | txId=%s | err=%s", result.transactionId, err)
            else:
                logger.info(
                    "Kafka produce confirmed | topic=%s | partition=%d | offset=%d | txId=%s",
                    msg.topic(), msg.partition(), msg.offset(), result.transactionId,
                )

        producer.produce(
            topic=settings.producer_topic,
            key=result.transactionId.encode("utf-8"),
            value=result.model_dump_json().encode("utf-8"),
            callback=_delivery_report,
        )
        remaining = producer.flush(timeout=5.0)
        if remaining > 0 or delivery_error:
            raise RuntimeError(
                f"Failed to confirm delivery to {settings.producer_topic}: {delivery_error or 'flush timeout'}"
            )

    def send_to_dlq(self, raw_value: bytes | None, error: Exception, key: str = "unknown") -> None:
        try:
            producer = self._ensure_producer()
            raw_text = raw_value.decode("utf-8", errors="replace") if raw_value else ""
            dlq_payload = {
                "sourceTopic": settings.consumer_topic,
                "failedAt": datetime.now(KST).isoformat(timespec="seconds"),
                "errorType": type(error).__name__,
                "errorMessage": str(error),
                "rawPayload": raw_text,
            }
            producer.produce(
                topic=settings.dlq_topic,
                key=key.encode("utf-8"),
                value=json.dumps(dlq_payload, ensure_ascii=False).encode("utf-8"),
            )
            producer.flush(timeout=5.0)
            logger.warning("Routed failed message to DLQ | topic=%s | error=%s", settings.dlq_topic, error)
        except Exception as dlq_exc:
            logger.error("Failed to publish message to DLQ | error=%s", dlq_exc, exc_info=True)

    def process_raw_message(self, raw_value: bytes | None) -> bool:
        """단일 메시지를 파싱 → 하이브리드 분석 → 결과 발행한다.

        반환값:
            True  : 정상 처리 완료 또는 DLQ 격리 완료 (오프셋 커밋 진행)
            False : 일시적 브로커 장애 등으로 커밋하지 않고 재처리 필요
        """
        if not raw_value:
            self.send_to_dlq(raw_value, ValueError("Empty Kafka message payload"))
            return True

        tx_id = "unknown"
        try:
            payload = json.loads(raw_value.decode("utf-8"))
            if isinstance(payload, dict) and payload.get("transactionId"):
                tx_id = str(payload["transactionId"])
            input_data = PaymentLogInput(**payload)
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
            logger.error("Message validation failed → DLQ | txId=%s | error=%s", tx_id, exc)
            self.send_to_dlq(raw_value, exc, key=tx_id)
            return True

        try:
            result = self._detector.analyze(input_data)
            self.produce_fraud_result(result)
            return True
        except Exception as exc:
            logger.error("Analysis/produce failed → DLQ | txId=%s | error=%s", tx_id, exc, exc_info=True)
            self.send_to_dlq(raw_value, exc, key=tx_id)
            return True

    @staticmethod
    def _on_assign(consumer, partitions) -> None:
        # Python 3.14 호환: str(p) 대신 속성 직접 추출 (강제 OFFSET_BEGINNING 리셋 금지)
        safe_partitions = [f"{p.topic}:{p.partition}" for p in partitions]
        logger.info("Partitions assigned (committed offset preserved): %s", safe_partitions)

    @staticmethod
    def _on_revoke(consumer, partitions) -> None:  # noqa: ARG001
        safe_partitions = [f"{p.topic}:{p.partition}" for p in partitions]
        logger.info("Partitions revoked: %s", safe_partitions)

    async def run(self) -> None:
        logger.info(
            "Kafka consumer starting | topic=%s | group=%s | broker=%s",
            settings.consumer_topic, settings.consumer_group, settings.kafka_broker,
        )

        self._running = True
        try:
            self._consumer = Consumer({
                "bootstrap.servers": settings.kafka_broker,
                "group.id": settings.consumer_group,
                "auto.offset.reset": "earliest",
                "enable.auto.commit": "false",
                "session.timeout.ms": "30000",
                "heartbeat.interval.ms": "3000",
                "max.poll.interval.ms": "300000",
            })
            self._consumer.subscribe(
                [settings.consumer_topic],
                on_assign=self._on_assign,
                on_revoke=self._on_revoke,
            )

            loop = asyncio.get_running_loop()

            while True:
                msg = await loop.run_in_executor(None, self._consumer.poll, 1.0)
                if msg is None:
                    continue
                if msg.error():
                    err_code = msg.error().code()
                    if err_code == KafkaError._PARTITION_EOF:
                        continue
                    if err_code == KafkaError.UNKNOWN_TOPIC_OR_PART:
                        logger.warning(
                            "Topic %s not yet available on broker — waiting 2s before retry...",
                            settings.consumer_topic,
                        )
                        await asyncio.sleep(2.0)
                        continue
                    raise KafkaException(msg.error())

                should_commit = await loop.run_in_executor(None, self.process_raw_message, msg.value())
                if should_commit:
                    self._consumer.commit(message=msg, asynchronous=False)

        except asyncio.CancelledError:
            logger.info("Kafka consumer shutdown requested")
        except Exception:
            logger.critical("Kafka consumer crashed", exc_info=True)
        finally:
            self._running = False
            if self._consumer is not None:
                try:
                    self._consumer.close()
                except Exception:
                    pass
            if self._producer is not None:
                try:
                    self._producer.flush(timeout=5.0)
                except Exception:
                    pass
            logger.info("Kafka consumer and producer closed gracefully")
