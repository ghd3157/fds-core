# [Step 1 & 2] 구현 기록
> 참고 명세서: `docs/python-requirements.md`

## 개요

FDS(이상 거래 탐지 시스템) Python 서버의 기반 레이어 구현:
- **Step 1**: FastAPI 백그라운드 태스크와 연동된 Kafka 비동기 컨슈머 / 프로듀서 뼈대 구축
- **Step 2**: Pydantic 데이터 검증 모델 (입력 / 출력 스키마) 작성

---

## 프로젝트 설정

### 패키지 목록 (`requirements.txt`)

| 패키지 | 용도 |
|---|---|
| `fastapi` | 비동기 웹 프레임워크 |
| `uvicorn` | ASGI 서버 |
| `pandas` | 데이터 전처리 (Step 3에서 사용) |
| `confluent-kafka` | Kafka 컨슈머 / 프로듀서 클라이언트 |
| `pydantic` | JSON 데이터 검증 (Step 2) |

### 실행 방법

FastAPI 앱은 표준 패키지 구조를 따르기 위해 루트의 `main.py` 대신 `app/main.py` 로 이동:

```bash
uvicorn app.main:app --reload
```

---

## Step 2 — Pydantic 스키마 (`app/schemas.py`)

### 입력 스키마: `PaymentLogInput`

`payment-log-topic` 수신 메시지 검증 (Java → Python)

| 필드 | 타입 | 설명 |
|---|---|---|
| `transactionId` | `str` | 고유 결제 ID |
| `userId` | `str` | 사용자 식별자 |
| `amount` | `float` | 결제 금액 |
| `merchantCategory` | `str` | 가맹점 업종 코드 |
| `transactionDate` | `str` | ISO-8601 형식 거래 일시 |
| `latitude` | `float` | 거래 위치 (위도) |
| `longitude` | `float` | 거래 위치 (경도) |

### 출력 스키마: `FraudResultOutput`

`fraud-result-topic` 송신 메시지 검증 (Python → Java)

| 필드 | 타입 | 제약 조건 | 설명 |
|---|---|---|---|
| `transactionId` | `str` | — | 원본 결제 ID |
| `isFraud` | `bool` | — | AI 사기 판별 결과 |
| `fraudScore` | `float` | `0.0 ≤ x ≤ 1.0` | 위험도 스코어 |
| `reason` | `str` | — | 판별 근거 |

> `fraudScore` 는 `Field(ge=0.0, le=1.0)` 으로 Pydantic 검증 레이어에서 0~1 범위를 강제함.

---

## Step 1 — Kafka 뼈대 (`app/kafka_client.py` + `app/main.py`)

### Kafka 설정

| 항목 | 값 |
|---|---|
| 브로커 주소 | `127.0.0.1:9092` |
| 컨슈머 토픽 | `payment-log-topic` |
| 프로듀서 토픽 | `fraud-result-topic` |
| 컨슈머 그룹 | `fds-python-group` |

### 컨슈머 아키텍처

```
FastAPI 시작
    └─ asyncio.create_task(run_kafka_consumer())
            └─ while True:
                    └─ loop.run_in_executor(None, consumer.poll, 1.0)
                            └─ _process_message(msg.value())
                                    └─ produce_fraud_result(result)
```

- `consumer.poll()` 은 블로킹 호출이므로 `run_in_executor` 를 통해 스레드 풀로 위임하여 asyncio 이벤트 루프 블로킹 방지.
- 컨슈머 루프는 FastAPI 시작 시 `asyncio.Task` 로 실행되고, 종료 시 graceful cancel 처리.

### FastAPI 라이프사이클 (`app/main.py`)

```python
@app.on_event("startup")
async def startup_event():
    _consumer_task = asyncio.create_task(run_kafka_consumer())

@app.on_event("shutdown")
async def shutdown_event():
    _consumer_task.cancel()
    await asyncio.gather(_consumer_task, return_exceptions=True)
```

> **참고**: `@app.on_event` 는 최신 FastAPI 버전에서 소프트 deprecated. 향후 `lifespan` 컨텍스트 매니저로 마이그레이션 예정.

### 메시지 처리 흐름 (Step 3 연동 전 더미 구현)

```
Kafka 수신 raw bytes
    → json.loads()
    → PaymentLogInput(**payload)   # Pydantic 검증
    → FraudResultOutput 더미 생성 (isFraud=False, fraudScore=0.0)
    → produce_fraud_result()       # 직렬화 후 fraud-result-topic 발행
```

---

## 구현 후 파일 구조

```
fds-python-server/
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI 앱 + 라이프사이클 훅
│   ├── schemas.py       # Pydantic 입출력 모델
│   └── kafka_client.py  # Kafka 컨슈머 & 프로듀서 뼈대
├── docs/
│   └── python-requirements.md
└── requirements.txt
```

---

## 다음 단계

**[Step 3]** `kafka_client.py` 의 더미 `_process_message()` 내부를 아래로 교체:
- Pandas 전처리 파이프라인
- 실제 AI / 규칙 기반 사기 추론 로직
