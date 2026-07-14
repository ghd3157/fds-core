# [Step 1 & 2] Implementation Notes
> Reference spec: `docs/python-requirements.md`

## Overview

Implemented the foundational layer of the FDS (Fraud Detection System) Python server:
- **Step 1**: Kafka async Consumer / Producer skeleton wired to FastAPI background task
- **Step 2**: Pydantic data validation models (Input / Output schemas)

---

## Project Setup

### Requirements (`requirements.txt`)

| Package | Purpose |
|---|---|
| `fastapi` | Async web framework |
| `uvicorn` | ASGI server |
| `pandas` | Data preprocessing (Step 3) |
| `confluent-kafka` | Kafka Consumer / Producer client |
| `pydantic` | JSON data validation (Step 2) |

### Entry Point

The FastAPI app was moved from `main.py` (root) into `app/main.py` to follow the standard package structure.
Run with:
```bash
uvicorn app.main:app --reload
```

---

## Step 2 — Pydantic Schemas (`app/schemas.py`)

### Input: `PaymentLogInput`

Validates messages received from `payment-log-topic` (Java → Python).

| Field | Type | Description |
|---|---|---|
| `transactionId` | `str` | Unique transaction ID |
| `userId` | `str` | User identifier |
| `amount` | `float` | Transaction amount |
| `merchantCategory` | `str` | Merchant category code |
| `transactionDate` | `str` | ISO-8601 timestamp |
| `latitude` | `float` | Transaction location (lat) |
| `longitude` | `float` | Transaction location (lng) |

### Output: `FraudResultOutput`

Validates messages sent to `fraud-result-topic` (Python → Java).

| Field | Type | Constraint | Description |
|---|---|---|---|
| `transactionId` | `str` | — | Original transaction ID |
| `isFraud` | `bool` | — | AI fraud determination result |
| `fraudScore` | `float` | `0.0 ≤ x ≤ 1.0` | Risk score |
| `reason` | `str` | — | Reason for determination |

> `fraudScore` is constrained with `Field(ge=0.0, le=1.0)` to enforce the 0–1 range at the Pydantic validation layer.

---

## Step 1 — Kafka Skeleton (`app/kafka_client.py` + `app/main.py`)

### Kafka Configuration

| Key | Value |
|---|---|
| Broker | `127.0.0.1:9092` |
| Consumer Topic | `payment-log-topic` |
| Producer Topic | `fraud-result-topic` |
| Consumer Group | `fds-python-group` |

### Consumer Architecture

```
FastAPI startup
    └─ asyncio.create_task(run_kafka_consumer())
            └─ while True:
                    └─ loop.run_in_executor(None, consumer.poll, 1.0)
                            └─ _process_message(msg.value())
                                    └─ produce_fraud_result(result)
```

- `consumer.poll()` is a blocking call, delegated to a thread executor via `run_in_executor` to avoid blocking the asyncio event loop.
- The consumer loop is launched as an `asyncio.Task` on FastAPI startup and cancelled gracefully on shutdown.

### FastAPI Lifecycle (`app/main.py`)

```python
@app.on_event("startup")
async def startup_event():
    _consumer_task = asyncio.create_task(run_kafka_consumer())

@app.on_event("shutdown")
async def shutdown_event():
    _consumer_task.cancel()
    await asyncio.gather(_consumer_task, return_exceptions=True)
```

> **Note**: `@app.on_event` is soft-deprecated in newer FastAPI versions. Migration to `lifespan` context manager is recommended in a future step.

### Message Processing Flow (Dummy — Step 3 placeholder)

```
Receive raw bytes from Kafka
    → json.loads()
    → PaymentLogInput(**payload)   # Pydantic validation
    → Build FraudResultOutput (dummy: isFraud=False, fraudScore=0.0)
    → produce_fraud_result()       # Serialize & publish to fraud-result-topic
```

---

## File Structure After This Step

```
fds-python-server/
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI app + lifecycle hooks
│   ├── schemas.py       # Pydantic Input / Output models
│   └── kafka_client.py  # Kafka Consumer & Producer skeleton
├── docs/
│   └── python-requirements.md
└── requirements.txt
```

---

## Next Step

**[Step 3]** Replace the dummy `_process_message()` body in `kafka_client.py` with:
- Pandas preprocessing pipeline
- Actual AI / rule-based fraud inference logic
