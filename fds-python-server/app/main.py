import asyncio
from contextlib import asynccontextmanager
import logging
import os

from fastapi import FastAPI

from app.copilot_service import generate_incident_report
from app.fraud_detector import HybridFraudDetector
from app.kafka_client import KafkaPipelineWorker
from app.retrain_service import execute_retrain, load_model_history
from app.schemas import (
    CopilotReportRequest,
    CopilotReportResponse,
    FraudResultOutput,
    PaymentLogInput,
    RetrainRequest,
    RetrainResponse,
)

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

    if os.getenv("FDS_DISABLE_KAFKA", "false").lower() != "true":
        consumer_task = asyncio.create_task(kafka_worker.run())

    yield

    if consumer_task is not None:
        consumer_task.cancel()
        await asyncio.gather(consumer_task, return_exceptions=True)
    detector.close()


app = FastAPI(title="FDS Hybrid AI & MLOps Server", version="2.1.0", lifespan=lifespan)


@app.get("/")
def root():
    return {
        "service": "fds-python-server",
        "version": "2.1.0",
        "message": "FDS 3-Layer Hybrid AI & MLOps Server is running",
    }


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "fds-python-server",
        "modelLoaded": detector.model_service.is_loaded,
        "iforestLoaded": detector.model_service.is_iforest_loaded,
        "modelVersion": detector.model_service.model_version,
        "redisConnected": detector.feature_store.ping(),
        "kafkaConsumerRunning": kafka_worker.is_running,
    }


@app.post("/api/v1/predict", response_model=FraudResultOutput)
def predict_sync(payload: PaymentLogInput):
    """단건 3중 하이브리드 추론 검증용 동기 엔드포인트"""
    return detector.analyze(payload)


@app.get("/api/v1/model/status")
def get_model_status():
    """현재 Champion 모델 메타데이터·평가 지표·PSI 드리프트·버전 이력 조회"""
    meta = detector.model_service.metadata
    return {
        "modelLoaded": detector.model_service.is_loaded,
        "iforestLoaded": detector.model_service.is_iforest_loaded,
        "modelVersion": detector.model_service.model_version,
        "trainedAt": meta.get("trained_at"),
        "datasetSource": meta.get("dataset_source"),
        "trainSamples": meta.get("train_samples", 0),
        "testSamples": meta.get("test_samples", 0),
        "feedbackSamples": meta.get("feedback_samples", 0),
        "metrics": meta.get("metrics", {}),
        "drift": detector.drift_monitor.get_status(),
        "history": load_model_history(),
    }


@app.post("/api/v1/model/retrain", response_model=RetrainResponse)
def retrain_model(request: RetrainRequest):
    """관리자 피드백 기반 Challenger 재학습 및 무중단 Hot-Swap"""
    return execute_retrain(request, detector)


@app.post("/api/v1/copilot/report", response_model=CopilotReportResponse)
def copilot_report(request: CopilotReportRequest):
    """이상 거래 관제 사건 요약 & 대응 권고 리포트 생성"""
    return generate_incident_report(request)
