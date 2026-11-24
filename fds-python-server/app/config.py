import os
from dataclasses import dataclass
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    kafka_broker: str = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
    consumer_topic: str = os.getenv("FDS_PAYMENT_LOG_TOPIC", "payment-log-topic")
    producer_topic: str = os.getenv("FDS_FRAUD_RESULT_TOPIC", "fraud-result-topic")
    dlq_topic: str = os.getenv("FDS_DLQ_TOPIC", "fds-dlq-topic")
    consumer_group: str = os.getenv("FDS_PYTHON_CONSUMER_GROUP", "fds-python-group")

    redis_host: str = os.getenv("REDIS_HOST", "localhost")
    redis_port: int = int(os.getenv("REDIS_PORT", "6379"))
    redis_db: int = int(os.getenv("REDIS_DB", "0"))
    redis_socket_timeout: float = float(os.getenv("REDIS_SOCKET_TIMEOUT", "1.5"))

    fraud_threshold: float = float(os.getenv("FDS_FRAUD_THRESHOLD", "80.0"))
    model_path: Path = Path(
        os.getenv("FDS_MODEL_PATH", str(BASE_DIR / "models" / "lgbm_fraud_v1.joblib"))
    )
    iforest_path: Path = Path(
        os.getenv("FDS_IFOREST_PATH", str(BASE_DIR / "models" / "iforest_v1.joblib"))
    )
    metadata_path: Path = Path(
        os.getenv("FDS_MODEL_METADATA_PATH", str(BASE_DIR / "models" / "metadata.json"))
    )
    history_path: Path = Path(
        os.getenv("FDS_MODEL_HISTORY_PATH", str(BASE_DIR / "models" / "history.json"))
    )

    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")


settings = Settings()
