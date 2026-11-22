import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.fraud_detector import HybridFraudDetector
from app.kafka_client import KafkaPipelineWorker
from app.schemas import FraudResultOutput, PaymentLogInput

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)

detector = HybridFraudDetector()
kafka_worker = KafkaPipelineWorker(detector)


@asynccontextmanager
async def lifespan(app: FastAPI):
    detector.initialize()
    consumer_task: asyncio.Task | None = None

    # 테스트 환경에서는 Kafka 백그라운드 루프를 비활성화할 수 있도록 제어
    if os.getenv("FDS_DISABLE_KAFKA", "false").lower() != "true":
        consumer_task = asyncio.create_task(kafka_worker.run())

    yield

    if consumer_task is not None:
        consumer_task.cancel()
        await asyncio.gather(consumer_task, return_exceptions=True)
    detector.close()


app = FastAPI(title="FDS Hybrid AI Server", version="2.0.0", lifespan=lifespan)


@app.get("/")
def root():
    return {
        "service": "fds-python-server",
        "version": "2.0.0",
        "message": "FDS Hybrid AI Server is running",
    }


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "fds-python-server",
        "modelLoaded": detector.model_service.is_loaded,
        "modelVersion": detector.model_service.model_version,
        "redisConnected": detector.feature_store.ping(),
        "kafkaConsumerRunning": kafka_worker.is_running,
    }


@app.post("/api/v1/predict", response_model=FraudResultOutput)
def predict_sync(payload: PaymentLogInput):
    """디버깅 및 단건 추론 검증용 동기 엔드포인트 (동기 def로 FastAPI 스레드풀 위임)"""
    return detector.analyze(payload)
