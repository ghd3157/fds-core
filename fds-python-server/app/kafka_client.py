import asyncio
import json
import logging
import traceback

from confluent_kafka import Consumer, Producer, KafkaError, KafkaException
from app.schemas import PaymentLogInput, FraudResultOutput

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
    def _delivery_report(err, msg):
        if err:
            logger.error("Kafka produce failed: %s", err)
        else:
            logger.info("Kafka produce success -> topic=%s partition=%d offset=%d",
                        msg.topic(), msg.partition(), msg.offset())

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
    print(f"[DEBUG] Message caught from Kafka: {raw_value}")

    try:
        payload = json.loads(raw_value.decode("utf-8"))
        input_data = PaymentLogInput(**payload)
        print(f"[SUCCESS] Pydantic parse OK - transactionId: {input_data.transactionId}")

        result = FraudResultOutput(
            transactionId=input_data.transactionId,
            isFraud=False,
            fraudScore=0.0,
            reason="Dummy result – AI model not yet connected",
        )
        produce_fraud_result(result)

    except Exception as exc:
        print(f"[PARSE ERROR] Failed to process message: {exc}")


def _on_assign(consumer, partitions):
    """Callback fired when partition assignment is confirmed by the group coordinator."""
    print(f"[PARTITION ASSIGNED] Partitions assigned: {[str(p) for p in partitions]}")
    # Seek to beginning so earliest offset is always respected on each startup.
    for p in partitions:
        p.offset = -2  # OFFSET_BEGINNING constant
    consumer.assign(partitions)


def _on_revoke(consumer, partitions):
    print(f"[PARTITION REVOKED] Partitions revoked: {[str(p) for p in partitions]}")


async def run_kafka_consumer() -> None:
    print("[BOOT] Kafka consumer task starting...")

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
        print(f"[BOOT] Subscribed to topic: {CONSUMER_TOPIC} | group: {CONSUMER_GROUP}")
        print("[BOOT] Waiting for partition assignment from group coordinator...")

        loop = asyncio.get_event_loop()
        poll_count = 0

        while True:
            msg = await loop.run_in_executor(None, consumer.poll, 1.0)

            poll_count += 1
            if poll_count % 5 == 0:
                print(f"[HEARTBEAT] Consumer alive - polls: {poll_count}")

            if msg is None:
                continue
            if msg.error():
                if msg.error().code() == KafkaError._PARTITION_EOF:
                    continue
                raise KafkaException(msg.error())

            _process_message(msg.value())

    except asyncio.CancelledError:
        print("[SHUTDOWN] Kafka Consumer shutdown requested")
    except Exception as e:
        print(f"[FATAL] Kafka Consumer crashed: {e}")
        traceback.print_exc()
    finally:
        try:
            consumer.close()
            _producer.flush()
        except Exception:
            pass