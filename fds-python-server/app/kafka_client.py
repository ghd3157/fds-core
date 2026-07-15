import asyncio
import json
import logging
import traceback

from confluent_kafka import Consumer, Producer, KafkaError, KafkaException
from app.schemas import PaymentLogInput, FraudResultOutput
from app.fraud_detector import analyze_fraud_risk

logger = logging.getLogger(__name__)

KAFKA_BROKER = "127.0.0.1:9092"
CONSUMER_TOPIC = "payment-log-topic"
PRODUCER_TOPIC = "fraud-result-topic"
CONSUMER_GROUP = "fds-python-group"

# --------------------------------------------------------------------------- #
# Producer
# --------------------------------------------------------------------------- #

_producer = Producer({"bootstrap.servers": KAFKA_BROKER})


def produce_fraud_result(result: FraudResultOutput) -> None:
    """직렬화된 FraudResultOutput을 fraud-result-topic 으로 발행한다."""

    def _delivery_report(err, msg):
        if err:
            logger.error("Kafka produce failed: %s", err)
        else:
            logger.info(
                "Kafka produce success -> topic=%s partition=%d offset=%d",
                msg.topic(), msg.partition(), msg.offset(),
            )

    _producer.produce(
        topic=PRODUCER_TOPIC,
        value=result.model_dump_json().encode("utf-8"),
        callback=_delivery_report,
    )
    _producer.poll(0)


# --------------------------------------------------------------------------- #
# Consumer (백그라운드 루프)
# --------------------------------------------------------------------------- #

def _process_message(raw_value: bytes) -> None:
    """단일 Kafka 메시지를 파싱 → 분석 → 발행하는 파이프라인을 실행한다."""
    try:
        payload = json.loads(raw_value.decode("utf-8"))
        input_data = PaymentLogInput(**payload)
        logger.info("Message parsed OK - transactionId: %s", input_data.transactionId)

        result = analyze_fraud_risk(input_data)
        produce_fraud_result(result)

    except (json.JSONDecodeError, ValueError) as exc:
        logger.error("Message parse/validation failed: %s", exc)
    except Exception as exc:
        logger.error("Unexpected error while processing message: %s", exc, exc_info=True)


def _on_assign(consumer, partitions) -> None:
    """파티션 할당 확정 시 그룹 코디네이터로부터 호출되는 콜백.

    Note:
        str(p) 호출 시 발생하는 Python 3.14 SystemError를 방지하기 위해
        topic / partition 속성을 직접 f-string으로 추출한다.
    """
    # ⭐ str(p) 사용 시 발생하는 Python 3.14 SystemError를 피하기 위해 직접 변수 추출
    safe_partitions = [f"{p.topic}:{p.partition}" for p in partitions]
    logger.info("Partitions assigned: %s", safe_partitions)

    # 서버 재시작 시에도 earliest 오프셋이 보장되도록 명시적으로 OFFSET_BEGINNING 지정
    for p in partitions:
        p.offset = -2  # OFFSET_BEGINNING constant
    consumer.assign(partitions)


def _on_revoke(consumer, partitions) -> None:  # noqa: ARG001
    """파티션 소유권 반환 시 그룹 코디네이터로부터 호출되는 콜백.

    Note:
        str(p) 호출 시 발생하는 Python 3.14 SystemError를 방지하기 위해
        topic / partition 속성을 직접 f-string으로 추출한다.
    """
    # ⭐ 여기도 마찬가지로 안전하게 변환
    safe_partitions = [f"{p.topic}:{p.partition}" for p in partitions]
    logger.info("Partitions revoked: %s", safe_partitions)


async def run_kafka_consumer() -> None:
    """Kafka 컨슈머를 시작하고 메시지 폴링 루프를 실행한다.

    FastAPI 메인 스레드 블로킹을 방지하기 위해 consumer.poll()을
    loop.run_in_executor(None, ...) 로 래핑하여 비동기 실행한다.
    """
    logger.info(
        "Kafka consumer starting - topic=%s group=%s broker=%s",
        CONSUMER_TOPIC, CONSUMER_GROUP, KAFKA_BROKER,
    )

    try:
        consumer = Consumer({
            "bootstrap.servers": KAFKA_BROKER,
            "group.id": CONSUMER_GROUP,
            "auto.offset.reset": "earliest",
            "enable.auto.commit": "true",
            "auto.commit.interval.ms": "1000",
            "session.timeout.ms": "30000",
            "heartbeat.interval.ms": "3000",
            "max.poll.interval.ms": "300000",
        })
        consumer.subscribe(
            [CONSUMER_TOPIC],
            on_assign=_on_assign,
            on_revoke=_on_revoke,
        )
        logger.info("Waiting for partition assignment from group coordinator...")

        loop = asyncio.get_event_loop()

        while True:
            msg = await loop.run_in_executor(None, consumer.poll, 1.0)

            if msg is None:
                continue
            if msg.error():
                if msg.error().code() == KafkaError._PARTITION_EOF:
                    continue
                raise KafkaException(msg.error())

            _process_message(msg.value())

    except asyncio.CancelledError:
        logger.info("Kafka consumer shutdown requested")
    except Exception:
        logger.critical("Kafka consumer crashed", exc_info=True)
        traceback.print_exc()
    finally:
        try:
            consumer.close()
            _producer.flush()
            logger.info("Kafka consumer and producer closed gracefully")
        except Exception:
            pass