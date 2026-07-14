import asyncio
import logging

from fastapi import FastAPI

from app.kafka_client import run_kafka_consumer

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Capstone FDS AI Server")

_consumer_task: asyncio.Task | None = None


@app.on_event("startup")
async def startup_event():
    global _consumer_task
    _consumer_task = asyncio.create_task(run_kafka_consumer())


@app.on_event("shutdown")
async def shutdown_event():
    if _consumer_task:
        _consumer_task.cancel()
        await asyncio.gather(_consumer_task, return_exceptions=True)


@app.get("/")
async def root():
    return {"message": "Python AI Server is Running Successfully!"}


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "fds-python-server"}